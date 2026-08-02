import Redis from "ioredis";
import { PrismaClient } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";

const FAILURE_TYPES = new Set([
  'BOUNCED', 'COMPLAINED', 'FAILED', 'SUPPRESSED',
  'REJECTED', 'RENDER_FAILED',
]);

// Suffix → Prisma column on campaign_stats. Suffixes not listed (DELIVERY_DELAY,
// SUBSCRIPTION, OTHER) stay Redis-only.
const SUFFIX_TO_COLUMN = {
  SENT: 'sent',
  DELIVERED: 'delivered',
  OPENED: 'opened',
  CLICKED: 'clicked',
  BOUNCED: 'bounced',
  COMPLAINED: 'complained',
  FAILED: 'failed',
  SUPPRESSED: 'suppressed',
  UNSUBSCRIBED: 'unsubscribed',
  REJECTED: 'rejected',
  RENDER_FAILED: 'renderFailed',
};

/**
 * Reuse PrismaClient between warm invocations
 */
const globalForPrisma = globalThis;
const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    accelerateUrl: process.env.DATABASE_URL,
    log: ["error"],
  }).$extends(withAccelerate());
if (!globalForPrisma.prisma) globalForPrisma.prisma = prisma;

/**
 * Configuration
 */
const REDIS_HOST = process.env.REDIS_HOST;
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379", 10);
const REDIS_USERNAME = process.env.REDIS_USERNAME || undefined;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;
const REDIS_TLS = process.env.REDIS_TLS === "true";

const STATS_TTL_SECONDS = 2 * 24 * 60 * 60; // 2 days for counters (as requested)
const DEDUPE_TTL_SECONDS = 1 * 24 * 60 * 60; // 1 day for dedupe keys

const BOUNCE_RATE_THRESHOLD = 3.5;
const COMPLAINT_RATE_THRESHOLD = 0.1;
const MIN_SAMPLE_SIZE = 50;

// CloudWatch metrics are emitted as EMF (Embedded Metric Format) log lines:
// no PutMetricData call, no extra IAM, no added invocation latency. CloudWatch
// parses the JSON out of the log stream and creates the metrics asynchronously.
const METRICS_ENABLED = process.env.METRICS_ENABLED !== "false";
const METRIC_NAMESPACE = process.env.METRIC_NAMESPACE || "Mailpackr/SES";
const DIAGNOSTIC_CODE_MAX_LENGTH = 512;

/**
 * Reuse Redis client between warm invocations
 */
let redisClient = null;
function getRedis() {
  if (!redisClient) {
    redisClient = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      username: REDIS_USERNAME,
      password: REDIS_PASSWORD,
      tls: REDIS_TLS ? {} : undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      connectionName: "lambda-ses-sqs-consumer",
    });

    redisClient.on("error", (err) => {
      console.error("[redis] error:", err);
    });
    redisClient.on("connect", () => {
      console.debug("[redis] connected");
    });
  }
  return redisClient;
}

/**
 * Single-line JSON logs so CloudWatch Logs Insights can filter on fields
 * (e.g. `filter bounceSubType = "MailboxFull"`) instead of regex-ing strings.
 */
function logJson(level, event, payload = {}) {
  const line = JSON.stringify({ level, event, ...payload });
  if (level === "ERROR") console.error(line);
  else if (level === "WARN") console.warn(line);
  else console.log(line);
}

/**
 * Per-invocation metric aggregator. Counts are summed in memory and flushed as
 * one EMF line per distinct dimension set, so a 100-record batch costs a
 * handful of log lines rather than 100 API calls.
 *
 * Dimensions must stay low-cardinality — campaignId/subscriberId belong in the
 * structured logs, never in a dimension, or CloudWatch bills per unique series.
 */
function createMetricBuffer() {
  const buckets = new Map();

  return {
    add(name, value, dimensions = {}, unit = "Count") {
      if (!METRICS_ENABLED || !Number.isFinite(value)) return;

      const clean = {};
      for (const [k, v] of Object.entries(dimensions)) {
        if (v === undefined || v === null || v === "") continue;
        clean[k] = String(v).slice(0, 255);
      }

      const key = Object.keys(clean)
        .sort()
        .map((k) => `${k}=${clean[k]}`)
        .join("|");

      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { dimensions: clean, metrics: new Map() };
        buckets.set(key, bucket);
      }

      const existing = bucket.metrics.get(name);
      if (existing) existing.value += value;
      else bucket.metrics.set(name, { value, unit });
    },

    flush() {
      if (!METRICS_ENABLED || buckets.size === 0) return;
      const timestamp = Date.now();

      for (const { dimensions, metrics } of buckets.values()) {
        const dimensionKeys = Object.keys(dimensions);
        const values = {};
        const definitions = [];
        for (const [name, m] of metrics) {
          values[name] = m.value;
          definitions.push({ Name: name, Unit: m.unit });
        }

        console.log(
          JSON.stringify({
            _aws: {
              Timestamp: timestamp,
              CloudWatchMetrics: [
                {
                  Namespace: METRIC_NAMESPACE,
                  // Two dimension sets: the dimensioned series, plus [] for a
                  // namespace-wide rollup so `Bounces` and `EventsProcessed`
                  // are alarmable without a SEARCH expression. The rollup costs
                  // one extra series per metric name, not per dimension value.
                  Dimensions: dimensionKeys.length ? [dimensionKeys, []] : [[]],
                  Metrics: definitions,
                },
              ],
            },
            ...dimensions,
            ...values,
          })
        );
      }

      buckets.clear();
    },
  };
}

function truncate(value, max) {
  if (value === undefined || value === null) return null;
  const s = String(value);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * Logs keep the domain only — the full address already lives on the Event row
 * in Postgres, so there is no reason to duplicate PII into CloudWatch.
 */
function emailDomain(address) {
  if (!address || typeof address !== "string") return null;
  const at = address.lastIndexOf("@");
  return at === -1 ? null : address.slice(at + 1).toLowerCase();
}

/**
 * Bounce detail from an SES `Bounce` event.
 *
 * bounceType is Permanent | Transient | Undetermined; bounceSubType narrows it:
 *   Permanent → General, NoEmail, Suppressed, OnAccountSuppressionList
 *   Transient → General, MailboxFull, MessageTooLarge, ContentRejected,
 *               AttachmentRejected
 * Permanent means "never send here again", Transient means "retryable" — the
 * suppression-list decision hangs off that distinction.
 */
function extractBounceDetail(sesEvent) {
  const bounce = sesEvent?.bounce;
  if (!bounce) return null;

  const bounceType = String(bounce.bounceType || "Undetermined");
  const bounceSubType = String(bounce.bounceSubType || "Undetermined");
  const bouncedRecipients = Array.isArray(bounce.bouncedRecipients)
    ? bounce.bouncedRecipients
    : [];

  return {
    bounceType,
    bounceSubType,
    severity:
      bounceType === "Permanent"
        ? "hard"
        : bounceType === "Transient"
          ? "soft"
          : "undetermined",
    reportingMTA: bounce.reportingMTA || null,
    feedbackId: bounce.feedbackId || null,
    timestamp: bounce.timestamp || null,
    recipients: bouncedRecipients.map((r) => ({
      domain: emailDomain(r?.emailAddress),
      action: r?.action || null,
      // SMTP enhanced status code, e.g. "5.1.1" (bad mailbox), "4.4.7" (timeout)
      status: r?.status || null,
      diagnosticCode: truncate(r?.diagnosticCode, DIAGNOSTIC_CODE_MAX_LENGTH),
    })),
  };
}

/**
 * Complaint detail. complaintFeedbackType is the ARF type — abuse, fraud,
 * virus, other, not-spam — and complaintSubType is "OnAccountSuppressionList"
 * when SES generated the event itself rather than receiving a real report.
 */
function extractComplaintDetail(sesEvent) {
  const complaint = sesEvent?.complaint;
  if (!complaint) return null;

  const complained = Array.isArray(complaint.complainedRecipients)
    ? complaint.complainedRecipients
    : [];

  return {
    feedbackType: String(complaint.complaintFeedbackType || "unspecified"),
    complaintSubType: complaint.complaintSubType || null,
    userAgent: truncate(complaint.userAgent, 255),
    arrivalDate: complaint.arrivalDate || null,
    feedbackId: complaint.feedbackId || null,
    recipients: complained.map((r) => ({ domain: emailDomain(r?.emailAddress) })),
  };
}

/**
 * DeliveryDelay detail. delayType is InternalFailure | General | MailboxFull |
 * SpamDetected | RecipientServerError | IPFailure | TransientCommunicationFailure
 * | BYOIPHostNameLookupUnavailable | Undetermined. Sustained SpamDetected or
 * IPFailure is an early warning that bounces are about to follow.
 */
function extractDeliveryDelayDetail(sesEvent) {
  const delay = sesEvent?.deliveryDelay;
  if (!delay) return null;

  return {
    delayType: String(delay.delayType || "Undetermined"),
    expirationTime: delay.expirationTime || null,
    reportingMTA: delay.reportingMTA || null,
  };
}

/**
 * Pull whichever detail block matches the event, for logs, metrics and the
 * Event row payload.
 */
function extractEventDetail(suffix, sesEvent) {
  // Each extractor returns null when its block is absent (malformed event), so
  // downstream code never sees a half-built detail with undefined subtypes.
  switch (suffix) {
    case "BOUNCED":
    case "SUPPRESSED": {
      const detail = extractBounceDetail(sesEvent);
      return detail && { kind: "bounce", ...detail };
    }
    case "COMPLAINED": {
      const detail = extractComplaintDetail(sesEvent);
      return detail && { kind: "complaint", ...detail };
    }
    case "DELIVERY_DELAY": {
      const detail = extractDeliveryDelayDetail(sesEvent);
      return detail && { kind: "deliveryDelay", ...detail };
    }
    default:
      return null;
  }
}

/**
 * Emit the per-subtype metrics for one event.
 */
function recordDetailMetrics(metrics, suffix, detail, recipients) {
  if (!detail) return;

  if (detail.kind === "bounce") {
    metrics.add("Bounces", recipients, {
      BounceType: detail.bounceType,
      BounceSubType: detail.bounceSubType,
    });
    metrics.add(
      detail.severity === "hard"
        ? "HardBounces"
        : detail.severity === "soft"
          ? "SoftBounces"
          : "UndeterminedBounces",
      recipients
    );
    if (suffix === "SUPPRESSED") metrics.add("SuppressionListHits", recipients);
    return;
  }

  if (detail.kind === "complaint") {
    metrics.add("Complaints", recipients, { FeedbackType: detail.feedbackType });
    if (detail.complaintSubType) {
      metrics.add("Complaints", recipients, {
        ComplaintSubType: detail.complaintSubType,
      });
    }
    return;
  }

  if (detail.kind === "deliveryDelay") {
    metrics.add("DeliveryDelays", recipients, { DelayType: detail.delayType });
  }
}

/**
 * Redis breakdown keys so the dashboard can show "why did it bounce" without
 * scanning the Event table. Hash fields, same TTL as the counters.
 *
 * `recipients` may be negative — rollbackRedisCounters reuses this to reverse a
 * bump whose failure row never reached Postgres.
 */
function pipelineDetailBreakdown(pipeline, campaignId, detail, recipients) {
  if (!detail) return;

  if (detail.kind === "bounce") {
    const key = `campaign_bounce_subtypes:${campaignId}`;
    pipeline.hincrby(key, `${detail.bounceType}/${detail.bounceSubType}`, recipients);
    pipeline.expire(key, STATS_TTL_SECONDS);
    return;
  }

  if (detail.kind === "complaint") {
    const key = `campaign_complaint_types:${campaignId}`;
    pipeline.hincrby(key, detail.feedbackType, recipients);
    pipeline.expire(key, STATS_TTL_SECONDS);
    return;
  }

  if (detail.kind === "deliveryDelay") {
    const key = `campaign_delay_types:${campaignId}`;
    pipeline.hincrby(key, detail.delayType, recipients);
    pipeline.expire(key, STATS_TTL_SECONDS);
  }
}

/**
 * Reverse the counter bumps processRecord already made for records whose
 * failure rows could not be persisted.
 *
 * Those records get their dedupe key dropped so SQS redelivers them; without
 * this the redelivery would count every one of those events a second time — in
 * Redis and, via statsIncrement, in campaign_stats. Inflated bounce/complaint
 * counts feed checkComplianceForCampaign, so the blast radius is a wrongly
 * suspended user, not just a bad dashboard number.
 */
async function rollbackRedisCounters(redis, entries) {
  if (!entries.length) return;

  const pipeline = redis.pipeline();
  for (const entry of entries) {
    const { campaignId, type, recipients } = entry.statsIncrement;
    pipeline.decrby(`campaign_stats:${campaignId}:${type}`, recipients);
    pipeline.decrby(`campaign_stats:${campaignId}:total`, recipients);
    pipelineDetailBreakdown(pipeline, campaignId, entry.detail, -recipients);
  }
  await pipeline.exec();
}


function mapEventToSuffix(rawEvent, sesEvent) {
  if (!rawEvent) return "OTHER";

  const t = String(rawEvent).toLowerCase();

  switch (t) {
    case "send":
      return "SENT";

    case "delivery":
      return "DELIVERED";

    case "open":
      return "OPENED";

    case "click":
      return "CLICKED";

    case "reject":
      return "REJECTED";

    case "bounce": {
      const subType = sesEvent?.bounce?.bounceSubType;

      if (
        subType === "Suppressed" ||
        subType === "OnAccountSuppressionList"
      ) {
        return "SUPPRESSED";
      }

      return "BOUNCED";
    }

    case "renderingfailure":
    case "rendering failure":
      return "RENDER_FAILED";

    case "complaint":
      return "COMPLAINED";

    case "deliverydelay":
      return "DELIVERY_DELAY";

    case "subscription":
      return "SUBSCRIPTION";

    case "failed":
      return "FAILED";

    case "unsubscription":
      return "UNSUBSCRIBED";

    default:
      return "OTHER";
  }
}

/**
 * Get recipient count for the event.
 * Uses delivery.recipients, bounce.recipients, complaint.complainedRecipients,
 * mail.destination or mail.commonHeaders.to; fallback 1.
 */
function getRecipientCount(sesEvent) {
  try {
    if (Array.isArray(sesEvent?.delivery?.recipients) && sesEvent.delivery.recipients.length)
      return sesEvent.delivery.recipients.length;

    // SES publishes this as `bouncedRecipients`; `recipients` kept for any
    // hand-rolled payloads that used the old shape.
    if (Array.isArray(sesEvent?.bounce?.bouncedRecipients) && sesEvent.bounce.bouncedRecipients.length)
      return sesEvent.bounce.bouncedRecipients.length;

    if (Array.isArray(sesEvent?.bounce?.recipients) && sesEvent.bounce.recipients.length)
      return sesEvent.bounce.recipients.length;

    if (Array.isArray(sesEvent?.complaint?.complainedRecipients) && sesEvent.complaint.complainedRecipients.length)
      return sesEvent.complaint.complainedRecipients.length;

    if (Array.isArray(sesEvent?.mail?.destination) && sesEvent.mail.destination.length)
      return sesEvent.mail.destination.length;

    if (Array.isArray(sesEvent?.mail?.commonHeaders?.to) && sesEvent.mail.commonHeaders.to.length)
      return sesEvent.mail.commonHeaders.to.length;

    return 1;
  } catch (e) {
    return 1;
  }
}

/**
 * Extract campaignId from sesEvent.mail.tags.campaignId (array) OR fallback to configuration-set tag.
 * Returns null if not found.
 */
// function extractCampaignId(sesEvent) {
//   try {
//     const tags = sesEvent?.mail?.tags || {};
//     if (Array.isArray(tags.campaignId) && tags.campaignId.length > 0) return String(tags.campaignId[0]);
//     if (Array.isArray(tags["ses:configuration-set"]) && tags["ses:configuration-set"].length > 0)
//       return String(tags["ses:configuration-set"][0]);
//     return null;
//   } catch (e) {
//     return null;
//   }
// }

function extractCampaignId(sesEvent) {
  try {
    const tags = sesEvent?.mail?.tags || {};

    // Handle both campaignId and lowercase campaignid
    if (
      Array.isArray(tags.campaignId) &&
      tags.campaignId.length > 0
    ) {
      return String(tags.campaignId[0]);
    }

    if (
      Array.isArray(tags.campaignid) &&
      tags.campaignid.length > 0
    ) {
      return String(tags.campaignid[0]);
    }

    // Fallback to SES configuration set
    if (
      Array.isArray(tags["ses:configuration-set"]) &&
      tags["ses:configuration-set"].length > 0
    ) {
      return String(tags["ses:configuration-set"][0]);
    }

    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Extract subscriberId from sesEvent.mail.tags.subscriberId (array).
 * Returns null if not found. Lambda 2 uses this to join failures to Subscriber rows.
 */
function extractSubscriberId(sesEvent) {
  try {
    const tags = sesEvent?.mail?.tags || {};
    if (Array.isArray(tags.subscriberId) && tags.subscriberId.length > 0) {
      return String(tags.subscriberId[0]);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Choose stable unique id: prefer SNS message id (if envelope), then mail.messageId, then commonHeaders.messageId,
 * then fallback to SQS record.messageId.
 */
function extractUniqueId(sesEvent, sqsRecord) {
  try {
    if (sesEvent?._snsMessageId) return String(sesEvent._snsMessageId);
    if (sesEvent?.mail?.messageId) return String(sesEvent.mail.messageId);
    if (sesEvent?.mail?.commonHeaders?.messageId) return String(sesEvent.mail.commonHeaders.messageId);
    return sqsRecord?.messageId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  } catch (e) {
    return sqsRecord?.messageId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

/**
 * Parse SQS record body into SES event object.
 * Handles:
 *  - raw SES JSON (SNS raw delivery ON)
 *  - SNS envelope (Type=Notification) with .Message (SNS raw delivery OFF)
 *
 * If SNS envelope, attaches _snsMessageId to parsed sesEvent for dedupe.
 */
function parseSesEventFromRecord(record) {
  const rawBody = record.body;
  if (!rawBody) throw new Error("Empty SQS record body");

  // Try parse
  let parsed;
  try {
    parsed = JSON.parse(rawBody);
  } catch (err) {
    // Error()'s second positional argument is ignored, so the body has to go in
    // the message. Truncated: SQS bodies carry recipient addresses.
    throw new Error(`Invalid JSON in SQS record body: ${truncate(rawBody, 200)}`);
  }

  // Synthetic event from the app (FAILED before SES accepts, UNSUBSCRIBED on
  // status flip). Coerce into a minimal SES-event shape so the rest of the
  // pipeline stays unchanged.
  if (parsed?.synthetic === true) {
    return {
      eventType: parsed.eventType,
      mail: {
        messageId: parsed.uniqueId,
        tags: {
          campaignId: parsed.campaignId ? [parsed.campaignId] : [],
          subscriberId: parsed.subscriberId ? [parsed.subscriberId] : [],
        },
      },
      _synthetic: true,
      _recipients: parsed.recipients || 1,
      _metadata: parsed.metadata,
    };
  }

  // Detect SNS envelope (has Type and Message)
  if (parsed && (parsed.Type === "Notification" || parsed.Type === "notification") && parsed.Message) {
    // Message may be JSON string or object
    try {
      const msg = typeof parsed.Message === "string" ? JSON.parse(parsed.Message) : parsed.Message;
      // attach SNS id for dedupe
      if (parsed.MessageId) msg._snsMessageId = parsed.MessageId;
      if (parsed.MessageID) msg._snsMessageId = parsed.MessageID;
      return msg;
    } catch (inner) {
      // SES always publishes JSON here, so a non-JSON Message is a real anomaly.
      // Throwing routes the record to the DLQ with its body intact; the previous
      // fallback assigned a property to a string primitive, which throws a
      // confusing TypeError under ESM strict mode anyway.
      const snsMessageId = parsed.MessageId || parsed.MessageID || "unknown";
      throw new Error(
        `SNS Message is not valid JSON (snsMessageId=${snsMessageId}): ${truncate(parsed.Message, 200)}`
      );
    }
  }

  // Otherwise assume body is SES event JSON (raw delivery)
  return parsed;
}

/**
 * Process a single SQS record.
 * Returns true when processed/skipped successfully, false on error (so Lambda can retry that record).
 */
async function processRecord(record, metrics) {
  const redis = getRedis();

  let sesEvent;
  try {
    sesEvent = parseSesEventFromRecord(record);
    // A body of "null"/"123"/"[]" parses fine but is not an event. Validate here
    // so it becomes a handled record failure instead of a TypeError thrown past
    // this try block when the fields below are dereferenced.
    if (!sesEvent || typeof sesEvent !== "object" || Array.isArray(sesEvent)) {
      throw new Error(
        `Parsed SES event is not an object (got ${Array.isArray(sesEvent) ? "array" : sesEvent === null ? "null" : typeof sesEvent})`
      );
    }
  } catch (err) {
    metrics.add("ParseErrors", 1);
    logJson("ERROR", "record.parse_failed", {
      recordId: record?.messageId,
      error: err?.message,
    });
    // treat as processing failure to allow DLQ path after retries
    return { ok: false };
  }

  // Determine event suffix and recipient count
  const rawEventType = (sesEvent.eventType || sesEvent.event || "") .toString();
  const suffix = mapEventToSuffix(rawEventType, sesEvent);
  const recipients = sesEvent._synthetic
    ? sesEvent._recipients || 1
    : getRecipientCount(sesEvent);

  // Bounce/complaint/delay subtype breakdown — used for logs, metrics, the
  // Redis breakdown hash and the Event row payload.
  const detail = sesEvent._synthetic ? null : extractEventDetail(suffix, sesEvent);

  // Unique id for dedupe (use sns message id first if exists)
  const uniqueId = extractUniqueId(sesEvent, record);
  const dedupeKey = `ses:processed:${uniqueId}:${suffix}`;

  // Attempt to set dedupe key (NX). If already exists, skip counting (idempotent)
  try {
    const setRes = await redis.set(dedupeKey, "1", "NX", "EX", DEDUPE_TTL_SECONDS);
    if (setRes !== "OK") {
      metrics.add("DuplicateEvents", 1, { EventType: suffix });
      logJson("INFO", "event.duplicate", { dedupeKey, eventType: suffix });
      return { ok: true }; // treat duplicate as successful processing
    }
  } catch (err) {
    // If Redis is temporarily unavailable, you can choose:
    //  - Throw and let Lambda/SQS retry (safer to avoid double-counting)
    //  - Or continue and count (risk duplicates)
    metrics.add("RedisErrors", 1, { Operation: "dedupe" });
    logJson("ERROR", "redis.dedupe_failed", { uniqueId, error: err?.message });
    // Throw to let SQS/Lambda retry this record
    return { ok: false };
  }

  // Extract campaignId; if missing, log and skip (dedupe key already set so won't reprocess)
  const campaignId = extractCampaignId(sesEvent);
  if (!campaignId) {
    metrics.add("MissingCampaignId", 1, { EventType: suffix });
    logJson("WARN", "event.missing_campaign_id", { uniqueId, eventType: suffix });
    return { ok: true };
  }

  // Compose keys
  const eventKey = `campaign_stats:${campaignId}:${suffix}`;
  const totalKey = `campaign_stats:${campaignId}:total`;
  const isFailure = FAILURE_TYPES.has(suffix);
  const subscriberId = extractSubscriberId(sesEvent);

  // Bump Redis counters in one round-trip
  try {
    const pipeline = redis.pipeline();
    pipeline.incrby(eventKey, recipients);
    pipeline.expire(eventKey, STATS_TTL_SECONDS);
    pipeline.incrby(totalKey, recipients);
    pipeline.expire(totalKey, STATS_TTL_SECONDS);
    pipelineDetailBreakdown(pipeline, campaignId, detail, recipients);
    await pipeline.exec();
  } catch (err) {
    metrics.add("RedisErrors", 1, { Operation: "pipeline" });
    logJson("ERROR", "redis.pipeline_failed", { uniqueId, error: err?.message });
    try {
      await redis.del(dedupeKey);
    } catch (delErr) {
      logJson("ERROR", "redis.dedupe_rollback_failed", {
        dedupeKey,
        error: delErr?.message,
      });
    }
    return { ok: false };
  }

  metrics.add("EventsProcessed", recipients, { EventType: suffix });
  recordDetailMetrics(metrics, suffix, detail, recipients);

  logJson(isFailure ? "WARN" : "INFO", "event.processed", {
    campaignId,
    subscriberId,
    eventType: suffix,
    recipients,
    uniqueId,
    ...(detail?.kind === "bounce" && {
      bounceType: detail.bounceType,
      bounceSubType: detail.bounceSubType,
      severity: detail.severity,
      reportingMTA: detail.reportingMTA,
      // one entry per bounced recipient: domain + SMTP status + diagnostic
      bouncedRecipients: detail.recipients,
    }),
    ...(detail?.kind === "complaint" && {
      feedbackType: detail.feedbackType,
      complaintSubType: detail.complaintSubType,
      complainedRecipients: detail.recipients,
    }),
    ...(detail?.kind === "deliveryDelay" && {
      delayType: detail.delayType,
      expirationTime: detail.expirationTime,
    }),
  });

  // Counter bumped successfully — return increment for campaign_stats upsert
  const statsIncrement = { campaignId, type: suffix, recipients };

  if (isFailure) {
    return {
      ok: true,
      dedupeKey,
      statsIncrement,
      detail, // rollbackRedisCounters needs it to reverse the breakdown hash
      failureRow: {
        type: suffix,
        campaignId,
        subscriberId: subscriberId || null,
        createdAt: new Date(),
        data: {
          uniqueId,
          recipients,
          // Promoted out of `payload` so queries can hit it without digging
          // through the raw SES envelope.
          detail: detail || undefined,
          payload: sesEvent,
        },
      },
    };
  }

  return { ok: true, statsIncrement };
}

async function checkComplianceForCampaign(campaignId, metrics) {
  const redis = getRedis();

  const lockKey = `compliance_violation_lock:${campaignId}`;
  const alreadyHandled = await redis.get(lockKey);
  if (alreadyHandled) return;

  const [compSent, compBounced, compComplained, statsSent, statsBounced, statsComplained] =
    await Promise.all([
      redis.get(`campaign_compliance:${campaignId}:sent`),
      redis.get(`campaign_compliance:${campaignId}:bounced`),
      redis.get(`campaign_compliance:${campaignId}:complained`),
      redis.get(`campaign_stats:${campaignId}:SENT`),
      redis.get(`campaign_stats:${campaignId}:BOUNCED`),
      redis.get(`campaign_stats:${campaignId}:COMPLAINED`),
    ]);

  const sent = Math.max(parseInt(compSent || "0"), parseInt(statsSent || "0"));
  const bounced = Math.max(parseInt(compBounced || "0"), parseInt(statsBounced || "0"));
  const complained = Math.max(parseInt(compComplained || "0"), parseInt(statsComplained || "0"));
  const totalProcessed = sent;

  if (totalProcessed < MIN_SAMPLE_SIZE) return;

  const bounceRate = (bounced / totalProcessed) * 100;
  const complaintRate = (complained / totalProcessed) * 100;

  const bounceViolation = bounceRate >= BOUNCE_RATE_THRESHOLD;
  const complaintViolation = complaintRate >= COMPLAINT_RATE_THRESHOLD;

  if (!bounceViolation && !complaintViolation) return;

  const lockAcquired = await redis.set(lockKey, "1", "EX", 3600, "NX");
  if (!lockAcquired) return;

  let violation;
  if (bounceViolation && complaintViolation) violation = "both";
  else if (bounceViolation) violation = "bounce";
  else violation = "complaint";

  metrics?.add("ComplianceViolations", 1, { ViolationType: violation });
  logJson("ERROR", "compliance.violation", {
    campaignId,
    violation,
    bounceRate: Number(bounceRate.toFixed(2)),
    complaintRate: Number(complaintRate.toFixed(2)),
    sampleSize: totalProcessed,
  });

  try {
    await Promise.all([
      prisma.campaign.updateMany({
        where: { id: campaignId, status: { in: ["SENDING", "QUEUED"] } },
        data: { status: "CANCELLED" },
      }),
      redis.set(`campaign_cancelled:${campaignId}`, "1", "EX", 86400),
    ]);

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { userId: true, name: true },
    });

    if (!campaign) return;

    let reason;
    if (violation === "bounce") {
      reason = `Bounce rate ${bounceRate.toFixed(2)}% exceeded the 3.5% threshold on campaign "${campaign.name}"`;
    } else if (violation === "complaint") {
      reason = `Complaint rate ${complaintRate.toFixed(2)}% exceeded the 0.1% threshold on campaign "${campaign.name}"`;
    } else {
      reason = `Bounce rate ${bounceRate.toFixed(2)}% and complaint rate ${complaintRate.toFixed(2)}% exceeded thresholds on campaign "${campaign.name}"`;
    }

    await Promise.all([
      prisma.user.update({
        where: { id: campaign.userId },
        data: { suspended: true, suspendedAt: new Date(), suspendedReason: reason },
      }),
      redis.set(`user:suspended:${campaign.userId}`, "true", "EX", 86400),
      redis.set(`user:suspended_reason:${campaign.userId}`, reason, "EX", 86400),
    ]);

    const otherCampaigns = await prisma.campaign.findMany({
      where: {
        userId: campaign.userId,
        status: { in: ["SENDING", "QUEUED", "SCHEDULED"] },
        id: { not: campaignId },
      },
      select: { id: true },
    });

    if (otherCampaigns.length > 0) {
      await prisma.campaign.updateMany({
        where: {
          userId: campaign.userId,
          status: { in: ["SENDING", "QUEUED", "SCHEDULED"] },
        },
        data: { status: "CANCELLED" },
      });

      const pipeline = redis.pipeline();
      for (const c of otherCampaigns) {
        pipeline.set(`campaign_cancelled:${c.id}`, "1", "EX", 86400);
      }
      await pipeline.exec();
    }
  } catch (error) {
    // Release the lock only when handling failed, so the next bounce/complaint
    // event retries. On success the 1h TTL stands as the already-handled marker
    // checked at the top of this function.
    await redis.del(lockKey);
    throw error;
  }
}

/**
 * Lambda handler
 * Uses partial batch failure format: return { batchItemFailures: [{ itemIdentifier }] }
 * so only failed records are retried by SQS/Lambda.
 */
export const handler = async (event) => {
  const records = Array.isArray(event?.Records) ? event.Records : [];
  if (!records.length) {
    console.debug("No SQS records in event");
    return { batchItemFailures: [] };
  }

  const metrics = createMetricBuffer();
  const startedAt = Date.now();
  metrics.add("BatchSize", records.length);

  try {
    return await processBatch(records, metrics);
  } finally {
    metrics.add("ProcessingDuration", Date.now() - startedAt, {}, "Milliseconds");
    // Always flush, even when the batch threw — metrics are the only signal
    // that the failure happened at all.
    metrics.flush();
  }
};

async function processBatch(records, metrics) {
  // Process all records in parallel (Redis counter bumps). allSettled, not all:
  // one record throwing must not discard its siblings' results, since those
  // records already hold their dedupe keys and would be skipped as duplicates on
  // redelivery — losing their failure rows and campaign_stats increments.
  const settled = await Promise.allSettled(records.map((rec) => processRecord(rec, metrics)));
  const results = settled.map((outcome, i) => {
    if (outcome.status === "fulfilled") return outcome.value;
    metrics.add("RecordErrors", 1);
    logJson("ERROR", "record.unhandled_error", {
      recordId: records[i]?.messageId,
      error: outcome.reason?.message,
    });
    return { ok: false };
  });

  // Collect failure rows for a single batched DB insert
  const failureRows = [];
  const failureDedupeKeys = [];
  const failureIndexes = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r?.failureRow) {
      failureRows.push(r.failureRow);
      failureDedupeKeys.push(r.dedupeKey);
      failureIndexes.push(i);
    }
  }

  // Track which records should be retried via SQS
  const retryIndexes = new Set();
  for (let i = 0; i < results.length; i++) {
    if (!results[i]?.ok) retryIndexes.add(i);
  }

  // Write failures to Postgres in one batch
  if (failureRows.length > 0) {
    try {
      await prisma.event.createMany({
        data: failureRows,
        skipDuplicates: true, // @@unique([subscriberId, campaignId, type, data])
      });
      logJson("INFO", "db.failures_inserted", { count: failureRows.length });
    } catch (err) {
      metrics.add("DbWriteErrors", 1, { Operation: "event.createMany" });
      logJson("ERROR", "db.failure_insert_failed", {
        count: failureRows.length,
        error: err?.message,
      });
      // Let SQS retry these records; also roll back dedupe keys so Redis re-processes them
      const redis = getRedis();
      for (const idx of failureIndexes) retryIndexes.add(idx);
      try {
        // Counters first, dedupe keys second. If this throws, the dedupe keys
        // survive and the redelivery is skipped as a duplicate — the failure
        // row is lost but nothing is counted twice, which is the safer way to
        // fail given inflated counts can suspend a user.
        await rollbackRedisCounters(redis, failureIndexes.map((idx) => results[idx]));
        if (failureDedupeKeys.length) await redis.del(...failureDedupeKeys);
      } catch (delErr) {
        metrics.add("RedisErrors", 1, { Operation: "rollback" });
        logJson("ERROR", "redis.rollback_failed", { error: delErr?.message });
      }
    }
  }

  // Aggregate counter bumps per campaign and upsert campaign_stats (best-effort)
  const perCampaign = new Map();
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r?.statsIncrement) continue;
    // Records queued for retry had their Redis bumps rolled back above —
    // counting them here would double up when SQS redelivers them.
    if (retryIndexes.has(i)) continue;
    const { campaignId, type, recipients } = r.statsIncrement;
    const col = SUFFIX_TO_COLUMN[type];
    if (!col) continue; // DELIVERY_DELAY / SUBSCRIPTION / OTHER stay Redis-only
    if (!perCampaign.has(campaignId)) perCampaign.set(campaignId, { totalEvents: 0 });
    const bucket = perCampaign.get(campaignId);
    bucket[col] = (bucket[col] || 0) + recipients;
    bucket.totalEvents += recipients;
  }

  for (const [campaignId, bucket] of perCampaign) {
    try {
      await prisma.campaignStats.upsert({
        where: { campaignId },
        create: { campaignId, ...bucket, lastSyncAt: new Date() },
        update: {
          sent:         { increment: bucket.sent || 0 },
          delivered:    { increment: bucket.delivered || 0 },
          opened:       { increment: bucket.opened || 0 },
          clicked:      { increment: bucket.clicked || 0 },
          bounced:      { increment: bucket.bounced || 0 },
          complained:   { increment: bucket.complained || 0 },
          failed:       { increment: bucket.failed || 0 },
          suppressed:   { increment: bucket.suppressed || 0 },
          unsubscribed: { increment: bucket.unsubscribed || 0 },
          rejected:     { increment: bucket.rejected || 0 },
          renderFailed: { increment: bucket.renderFailed || 0 },
          totalEvents:  { increment: bucket.totalEvents },
          lastSyncAt:   new Date(),
        },
      });
    } catch (err) {
      // Best-effort: Redis remains source of truth during TTL window
      metrics.add("DbWriteErrors", 1, { Operation: "campaignStats.upsert" });
      logJson("ERROR", "db.stats_upsert_failed", { campaignId, error: err?.message });
    }
  }

  // Run compliance checks for campaigns that received bounce/complaint events
  for (const [campaignId, bucket] of perCampaign) {
    if (bucket.bounced || bucket.complained) {
      try {
        await checkComplianceForCampaign(campaignId, metrics);
      } catch (err) {
        metrics.add("ComplianceCheckErrors", 1);
        logJson("ERROR", "compliance.check_failed", { campaignId, error: err?.message });
      }
    }
  }

  const failedItemIdentifiers = [];
  for (const idx of retryIndexes) {
    const msgId = records[idx]?.messageId;
    if (msgId) failedItemIdentifiers.push({ itemIdentifier: msgId });
  }

  metrics.add("RecordsRetried", failedItemIdentifiers.length);
  return { batchItemFailures: failedItemIdentifiers };
}
