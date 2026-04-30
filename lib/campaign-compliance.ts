import { redis } from './redis';
import { prisma } from './prisma';
import { sendSuspensionEmail } from './email-templates/suspension';

const BOUNCE_RATE_THRESHOLD = 3.5;
const COMPLAINT_RATE_THRESHOLD = 0.1;
const MIN_SAMPLE_SIZE = 50;
const COMPLIANCE_KEY_TTL = 7 * 24 * 60 * 60; // 7 days

export interface ComplianceResult {
  compliant: boolean;
  bounceRate: number;
  complaintRate: number;
  totalProcessed: number;
  violation?: 'bounce' | 'complaint' | 'both';
}

export async function incrementComplianceCounter(
  campaignId: string,
  type: 'sent' | 'bounced' | 'complained'
): Promise<void> {
  const key = `campaign_compliance:${campaignId}:${type}`;
  await redis.incr(key);
  await redis.expire(key, COMPLIANCE_KEY_TTL);
}

export async function checkCampaignCompliance(
  campaignId: string
): Promise<ComplianceResult> {
  const [
    compSent,
    compBounced,
    compComplained,
    statsSent,
    statsBounced,
    statsComplained,
  ] = await Promise.all([
    redis.get(`campaign_compliance:${campaignId}:sent`),
    redis.get(`campaign_compliance:${campaignId}:bounced`),
    redis.get(`campaign_compliance:${campaignId}:complained`),
    redis.get(`campaign_stats:${campaignId}:SENT`),
    redis.get(`campaign_stats:${campaignId}:BOUNCED`),
    redis.get(`campaign_stats:${campaignId}:COMPLAINED`),
  ]);

  const sent = Math.max(parseInt(compSent || '0'), parseInt(statsSent || '0'));
  const bounced = Math.max(
    parseInt(compBounced || '0'),
    parseInt(statsBounced || '0')
  );
  const complained = Math.max(
    parseInt(compComplained || '0'),
    parseInt(statsComplained || '0')
  );
  const totalProcessed = sent;

  if (totalProcessed < MIN_SAMPLE_SIZE) {
    return {
      compliant: true,
      bounceRate: 0,
      complaintRate: 0,
      totalProcessed,
    };
  }

  const bounceRate = (bounced / totalProcessed) * 100;
  const complaintRate = (complained / totalProcessed) * 100;

  const bounceViolation = bounceRate >= BOUNCE_RATE_THRESHOLD;
  const complaintViolation = complaintRate >= COMPLAINT_RATE_THRESHOLD;

  if (!bounceViolation && !complaintViolation) {
    return { compliant: true, bounceRate, complaintRate, totalProcessed };
  }

  let violation: 'bounce' | 'complaint' | 'both';
  if (bounceViolation && complaintViolation) violation = 'both';
  else if (bounceViolation) violation = 'bounce';
  else violation = 'complaint';

  return {
    compliant: false,
    bounceRate,
    complaintRate,
    totalProcessed,
    violation,
  };
}

export async function handleComplianceViolation(
  campaignId: string,
  result: ComplianceResult
): Promise<void> {
  // Acquire a lock to prevent duplicate violation handling from concurrent batch workers
  const lockKey = `compliance_violation_lock:${campaignId}`;
  const lockAcquired = await redis.set(lockKey, '1', 'EX', 3600, 'NX');
  if (!lockAcquired) {
    console.log(
      `Compliance violation for campaign ${campaignId} already being handled`
    );
    return;
  }

  console.log(
    `🚨 Compliance violation for campaign ${campaignId}: ${result.violation} (bounce: ${result.bounceRate.toFixed(2)}%, complaint: ${result.complaintRate.toFixed(2)}%)`
  );

  // 1. Cancel the campaign and mark it in Redis for fast batch-level checks
  await Promise.all([
    prisma.campaign.updateMany({
      where: { id: campaignId, status: { in: ['SENDING', 'QUEUED'] } },
      data: { status: 'CANCELLED' },
    }),
    redis.set(`campaign_cancelled:${campaignId}`, '1', 'EX', 86400),
  ]);

  // 2. Get the campaign owner info
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      userId: true,
      name: true,
      user: { select: { email: true, name: true } },
    },
  });

  if (!campaign) return;

  // 3. Build suspension reason
  let reason: string;
  if (result.violation === 'bounce') {
    reason = `Bounce rate ${result.bounceRate.toFixed(2)}% exceeded the 3.5% threshold on campaign "${campaign.name}"`;
  } else if (result.violation === 'complaint') {
    reason = `Complaint rate ${result.complaintRate.toFixed(2)}% exceeded the 0.1% threshold on campaign "${campaign.name}"`;
  } else {
    reason = `Bounce rate ${result.bounceRate.toFixed(2)}% and complaint rate ${result.complaintRate.toFixed(2)}% exceeded thresholds on campaign "${campaign.name}"`;
  }

  // 4. Suspend the user and set Redis cache for fast API-level checks
  await Promise.all([
    prisma.user.update({
      where: { id: campaign.userId },
      data: { suspended: true, suspendedAt: new Date(), suspendedReason: reason },
    }),
    redis.set(`user:suspended:${campaign.userId}`, 'true', 'EX', 86400),
    redis.set(
      `user:suspended_reason:${campaign.userId}`,
      reason,
      'EX',
      86400
    ),
  ]);

  // 5. Cancel all other active campaigns for this user
  const otherCampaigns = await prisma.campaign.findMany({
    where: {
      userId: campaign.userId,
      status: { in: ['SENDING', 'QUEUED', 'SCHEDULED'] },
      id: { not: campaignId },
    },
    select: { id: true },
  });

  if (otherCampaigns.length > 0) {
    await prisma.campaign.updateMany({
      where: {
        userId: campaign.userId,
        status: { in: ['SENDING', 'QUEUED', 'SCHEDULED'] },
      },
      data: { status: 'CANCELLED' },
    });

    // Mark all cancelled campaigns in Redis
    const pipeline = redis.pipeline();
    for (const c of otherCampaigns) {
      pipeline.set(`campaign_cancelled:${c.id}`, '1', 'EX', 86400);
    }
    await pipeline.exec();
  }

  // 6. Remove pending batch jobs from queue for this campaign
  try {
    const { batchQueue } = await import('./email-queues');
    const waitingJobs = await batchQueue.getJobs(['waiting', 'delayed']);
    let removedCount = 0;
    for (const job of waitingJobs) {
      if (job.data.campaignId === campaignId) {
        await job.remove();
        removedCount++;
      }
    }
    if (removedCount > 0) {
      console.log(
        `Removed ${removedCount} pending batch jobs for campaign ${campaignId}`
      );
    }
  } catch (e) {
    console.error('Error removing batch jobs:', e);
  }

  // 7. Broadcast cancellation via SSE
  try {
    const { sseManager } = await import('./sse-manager');
    sseManager.broadcastToCampaign(campaignId, {
      type: 'campaign_cancelled',
      data: {
        campaignId,
        reason: 'compliance_violation',
        violation: result.violation,
        bounceRate: result.bounceRate,
        complaintRate: result.complaintRate,
      },
      id: `${Date.now()}-compliance`,
    });
  } catch (sseError) {
    console.error('Failed to broadcast SSE for compliance violation:', sseError);
  }

  // 8. Send suspension notification email
  try {
    await sendSuspensionEmail({
      email: campaign.user.email,
      name: campaign.user.name,
      reason,
      campaignName: campaign.name,
      bounceRate: result.bounceRate,
      complaintRate: result.complaintRate,
      violation: result.violation!,
    });
    console.log(`Suspension email sent to ${campaign.user.email}`);
  } catch (emailError) {
    console.error('Failed to send suspension email:', emailError);
  }
}

export async function isCampaignCancelled(
  campaignId: string
): Promise<boolean> {
  const cancelled = await redis.get(`campaign_cancelled:${campaignId}`);
  return cancelled === '1';
}
