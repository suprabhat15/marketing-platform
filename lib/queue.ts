import { Queue, Worker, Job } from 'bullmq';
import { prisma } from './prisma';
import { broadcastCampaignUpdate, broadcastEvent } from './event-broadcast';
import { BatchEmailProcessor, BatchEmailData, replaceVariables } from './batch-email-processor';
// import { CampaignProgressTracker } from './campaign-progress';
import { sendEmail } from './ses';
import { enhancedRateLimiter } from './global-rate-limiter';
import { emailErrorClassifier } from './error-classifier';
import { getRedisInstance, redis as redisForDlq, redis } from './redis';

async function checkCampaignCompletion(campaignId: string) {
  try {
    // Check if campaign is already complete to prevent duplicate processing
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { status: true }
    });

    if (!campaign || campaign.status === 'SENT' || campaign.status === 'FAILED') {
      console.log(`Campaign ${campaignId} already complete or not found, skipping completion check`);
      return;
    }

    // Efficiently check active jobs with pagination (avoid full scan for 1M-scale)
    const getActiveJobsCount = async (
      queue: Queue,
      campaignId: string
    ): Promise<number> => {
      let count = 0;
      let cursor = 0;
      const pageSize = 1000;
      while (true) {
        const jobs = await queue.getJobs(
          ['waiting', 'active'],
          cursor,
          cursor + pageSize - 1
        );
        const campaignJobs = jobs.filter(
          (job) => job.data.campaignId === campaignId
        );
        count += campaignJobs.length;
        if (jobs.length < pageSize) break;
        cursor += pageSize;
      }
      return count;
    };

    const [campaignActiveCount, batchActiveCount] = await Promise.all([
      getActiveJobsCount(campaignQueue, campaignId),
      getActiveJobsCount(batchQueue, campaignId),
    ]);

    if (campaignActiveCount > 0 || batchActiveCount > 0) {
      console.log(
        `Campaign ${campaignId} still has ${campaignActiveCount + batchActiveCount} active jobs, not yet complete`
      );
      return;
    }

    console.log(
      `\u2705 Campaign ${campaignId} batches complete, checking for DLQ retries...`
    );

    // Check DLQ via Redis (faster than full job scan)
    const dlqStats = await getDlqStats(campaignId);
    if (dlqStats.total > 0) {
      console.log(
        `Found ${dlqStats.total} failed emails for campaign ${campaignId} in DLQ, starting retry...`
      );
      try {
        const retryResult = await retryFailedEmailsFromDLQ(campaignId);
        console.log(`DLQ retry result: ${JSON.stringify(retryResult)}`);
      } catch (dlqError) {
        console.error(`DLQ retry failed for campaign ${campaignId}:`, dlqError);
      }
    } else {
      console.log(
        `\u2728 No failed emails found for campaign ${campaignId}, marking as complete`
      );
    }
    await markCampaignComplete(campaignId);
  } catch (error) {
    console.error(
      `Error checking campaign completion for ${campaignId}:`,
      error
    );
  }
}

async function markCampaignComplete(campaignId: string) {
  try {
    // Use a conditional update to prevent duplicate completion
    const updatedCampaign = await prisma.campaign.updateMany({
      where: { 
        id: campaignId,
        status: { in: ['SENDING', 'QUEUED'] } // Only update if not already complete
      },
      data: { status: 'SENT', sentAt: new Date() }
    });
    
    if (updatedCampaign.count > 0) {
      console.log(`🎉 Campaign ${campaignId} marked as SENT`);
      await broadcastCampaignUpdate(campaignId, 'SENT');
    } else {
      console.log(`Campaign ${campaignId} already complete or not found, skipping completion`);
    }
  } catch (error) {
    console.error(`Error marking campaign ${campaignId} complete:`, error);
  }
}

// ----------------- Interfaces -----------------

interface CampaignJobData {
  campaignId: string;
  userId: string;
  batchSize?: number;
}

// ----------------- Queue Setup -----------------

// Use centralized Redis connection manager - share connections for better stability
const sharedRedisConnection = getRedisInstance('default'); // Use default instance for all queues
const connectionForQueue = sharedRedisConnection;
const connectionForWorker = getRedisInstance('worker'); // Keep separate for workers
const redisForDlq = sharedRedisConnection; // Share with main queues

const defaultJobOptions = {
  removeOnComplete: true,
  removeOnFail: 100,
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 }
};

// Queue configuration with connection sharing and built-in limiter for pacing (7 batches/sec max, but global limiter handles SES)
const queueConfig = {
  connection: connectionForQueue,
  defaultJobOptions: {
    ...defaultJobOptions,
    limiter: { max: 7, duration: 1000 }, // Align with SES TPS
  },
};

export const campaignQueue = new Queue<CampaignJobData>(
  'campaign-processing',
  queueConfig
);
export const batchQueue = new Queue<BatchEmailData>(
  'batch-processing',
  queueConfig
);
export const emailQueue = batchQueue; // Alias for backward compatibility
export const dlqQueue = new Queue<any>('email-dlq', {
  connection: redisForDlq,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 50,
    attempts: 1, // DLQ jobs shouldn't retry again
  },
});
export const batchDlqQueue = new Queue<any>('batch-dlq', {
  connection: redisForDlq,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 50,
    attempts: 1,
  },
});

// Polar ingestion queue for handling SENT events to avoid 429 rate limits
export const polarIngestionQueue = new Queue<any>('polar-ingestion', {
  connection: connectionForQueue,
  defaultJobOptions: {
    removeOnComplete: 20,
    removeOnFail: 100,
    attempts: 5, // More attempts for rate limit retries
    backoff: { type: 'exponential', delay: 2000 },
    limiter: { max: 99, duration: 1000 }, // 2 requests per second to avoid rate limits
  },
});

// ----------------- Workers -----------------

export const campaignWorker = new Worker<CampaignJobData>(
  'campaign-processing',
  async (job: Job<CampaignJobData>) => {
    if (job.name !== 'process-campaign') return;

    const { campaignId, userId, batchSize = 100 } = job.data;

    try {
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        include: {
          template: true,
          list: { include: { subscribers: { where: { status: 'ACTIVE' } } } },
        },
      });
      if (!campaign || !campaign.template) {
        throw new Error(`Campaign/template not found for ${campaignId}`);
      }

      const subscribers = campaign.list.subscribers;
      if (!subscribers.length) return;

      // Check credits before processing campaign
      const { EmailService } = await import('./email-service');
      const creditCheck = await EmailService.checkCreditsBeforeSending(
        userId,
        subscribers.length
      );

      if (!creditCheck.canSend) {
        console.error(
          `❌ Insufficient credits for campaign ${campaignId}: need ${creditCheck.creditsRequired}, have ${creditCheck.creditsAvailable}`
        );
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { status: 'FAILED' },
        });
        throw new Error(
          `Insufficient credits: need ${creditCheck.creditsRequired}, have ${creditCheck.creditsAvailable}`
        );
      }

      // Reserve credits upfront for the entire campaign
      const creditsReserved = await EmailService.reserveCreditsForCampaign(
        userId,
        campaignId,
        subscribers.length
      );
      if (!creditsReserved) {
        console.error(
          `❌ Failed to reserve credits for campaign ${campaignId}`
        );
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { status: 'FAILED' },
        });
        throw new Error('Failed to reserve credits for campaign');
      }

      console.log(
        `✅ Reserved ${subscribers.length} credits for campaign ${campaignId}`
      );

      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'SENDING', sentAt: new Date() },
      });

      const pageSize = 5000; // Larger pages for efficiency at 1M scale
      const sendBatchSize = batchSize;
      let cursor: { id?: string } | undefined;
      let batchNumber = 0;
      let bulkBuffer: Parameters<typeof batchQueue.addBulk>[0] = [];
      const totalBatches = Math.ceil(subscribers.length / sendBatchSize);

      while (true) {
        const page = await prisma.subscriber.findMany({
          where: { listId: campaign.listId, status: 'ACTIVE' },
          take: pageSize,
          ...(cursor && { cursor: { id: cursor.id }, skip: 1 }),
          orderBy: { id: 'asc' }, // Ensure consistent cursor
        });
        if (!page.length) break;
        // console.log('--------- page.length ----------- ', page.length);

        for (let i = 0; i < page.length; i += sendBatchSize) {
          batchNumber++;
          const slice = page.slice(i, i + sendBatchSize);
          const batchData: BatchEmailData = {
            campaignId,
            batchNumber,
            totalBatches,
            subscriberIds: slice.map((s) => s.id),
            templateHtml:
              campaign.content ||
              campaign.template.content ||
              campaign.template.html ||
              '',
            subject: campaign.subject,
            fromEmail: campaign.fromEmail || process.env.FROM_EMAIL!,
            fromName: campaign.fromName || process.env.FROM_NAME!,
            replyTo: process.env.REPLY_TO_EMAIL!,
            startIndex: 0,
            endIndex: slice.length,
            userId: userId, // Add userId for credit tracking
          };
          bulkBuffer.push({
            name: 'process-batch' as const,
            data: batchData,
            opts: { delay: batchNumber * 1000 }, // 1s staggered start per batch
          });

          if (bulkBuffer.length >= 50) {
            // Smaller bulks to reduce memory spikes
            await batchQueue.addBulk(bulkBuffer);
            bulkBuffer = [];
          }
        }

        cursor = { id: page[page.length - 1].id };
      }

      if (bulkBuffer.length) await batchQueue.addBulk(bulkBuffer);
    } catch (error) {
      // Refund credits only for emails that were not sent
      try {
        const { EmailService } = await import('./email-service');

        // Get total subscribers that were supposed to be sent
        const campaign = await prisma.campaign.findUnique({
          where: { id: campaignId },
          include: {
            list: { include: { subscribers: { where: { status: 'ACTIVE' } } } },
          },
        });

        if (campaign?.list?.subscribers?.length) {
          const totalSubscribers = campaign.list.subscribers.length;

          // Count how many emails were actually sent (have SENT events)
          const sentEmailsCount = await prisma.event.count({
            where: {
              campaignId,
              type: 'SENT',
            },
          });

          // Also check Redis for sent emails (more accurate for recent sends)
          const redisSentKeys = await redis.keys(`sent:${campaignId}:*`);
          const actualSentCount = Math.max(
            sentEmailsCount,
            redisSentKeys.length
          );

          // Calculate emails that were not sent
          const unsentEmailsCount = totalSubscribers - actualSentCount;

          if (unsentEmailsCount > 0) {
            await EmailService.refundCreditsForFailedSends(
              userId,
              unsentEmailsCount,
              campaignId
            );
            console.log(
              `🔄 Refunded ${unsentEmailsCount} credits for unsent emails in failed campaign ${campaignId} (${actualSentCount}/${totalSubscribers} were sent)`
            );
          } else {
            console.log(
              `✅ No refund needed for campaign ${campaignId} - all ${actualSentCount} emails were sent before failure`
            );
          }
        }
      } catch (refundError) {
        console.error(
          `Failed to refund credits for campaign ${campaignId}:`,
          refundError
        );
      }

      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'FAILED' },
      });
      throw error;
    }
  },
  { connection: connectionForWorker, concurrency: 1 }
);

export const batchWorker = new Worker<BatchEmailData>(
  'batch-processing',
  async (job: Job<BatchEmailData>) => {
    if (job.name !== 'process-batch') return;

    // Add job timeout
    const jobTimeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Batch job timeout')), 300000); // 5 minute timeout for entire batch
    });

    try {
      const processor = new BatchEmailProcessor(5, 100); // 5 concurrent emails, 100ms delay
      console.log('-------------- PROCESSING BATCH ---------------- ');

      const processPromise = processor.processBatch(job.data);
      await Promise.race([processPromise, jobTimeout]);

      console.log(
        `Batch ${job.data.batchNumber}/${job.data.totalBatches} completed for campaign ${job.data.campaignId}`
      );

      // Deterministic completion check for last batch only (avoids races)
      if (job.data.batchNumber === job.data.totalBatches) {
        setTimeout(() => {
          checkCampaignCompletion(job.data.campaignId).catch((error) => {
            console.error(
              `Error in completion check for campaign ${job.data.campaignId}:`,
              error
            );
          });
        }, 10000); // 10s delay for stragglers at scale
      }
    } catch (error) {
      console.error(
        `Batch ${job.data.batchNumber} for campaign ${job.data.campaignId} failed:`,
        error
      );

      // Handle timeout specifically
      if (error instanceof Error && error.message === 'Batch job timeout') {
        console.error(
          `⏰ Batch ${job.data.batchNumber} timed out after 5 minutes`
        );
      }

      // For batch failures, check if any emails in this batch were sent and refund only unsent ones
      try {
        const { EmailService } = await import('./email-service');
        const campaignId = job.data.campaignId;
        const subscriberIds = job.data.subscriberIds;

        // Count how many emails from this batch were actually sent
        const sentInBatch = await redis.keys(`sent:${campaignId}:*`);
        const sentSubscriberIds = sentInBatch.map((key) => key.split(':')[2]); // Extract subscriber ID from key
        const unsentInBatch = subscriberIds.filter(
          (id) => !sentSubscriberIds.includes(id)
        );

        if (unsentInBatch.length > 0) {
          // Get user ID for refund
          const campaign = await prisma.campaign.findUnique({
            where: { id: campaignId },
            select: { userId: true },
          });

          if (campaign) {
            await EmailService.refundCreditsForFailedSends(
              campaign.userId,
              unsentInBatch.length,
              campaignId
            );
            console.log(
              `🔄 Refunded ${unsentInBatch.length} credits for unsent emails in failed batch ${job.data.batchNumber} of campaign ${campaignId}`
            );
          }
        }
      } catch (refundError) {
        console.error(
          `Failed to refund credits for batch ${job.data.batchNumber}:`,
          refundError
        );
      }

      await batchDlqQueue.add('failed-batch', {
        originalJobData: job.data,
        failedReason: (error as Error).message,
        failedAt: new Date().toISOString(),
        attemptsMade: job.attemptsMade,
        jobId: job.id,
      });
      throw error;
    }
  },
  { connection: connectionForWorker, concurrency: 7 }
);

export const emailWorker = batchWorker; // Alias for backward compatibility

// Polar ingestion worker for processing SENT events with rate limiting
export const polarIngestionWorker = new Worker<any>(
  'polar-ingestion',
  async (job: Job<any>) => {
    if (job.name !== 'ingest-sent-event') return;

    const { userId, eventType, eventData, attempt = 1 } = job.data;
    
    try {
      const { CreditService } = await import('./credit-service');
      
      // Process the SENT event with credit deduction and Polar ingestion
      await CreditService.processEmailEvent(userId, eventType, eventData);
      
      console.log(`✅ Polar SENT event ingested successfully for user ${userId} - campaign: ${eventData.campaignId}`);
      
    } catch (error: any) {
      if (error.message?.includes('429') || error.message?.includes('rate limit') || error.message?.includes('Too Many Requests')) {
        console.warn(`⚠️ Rate limit hit for Polar ingestion (attempt ${attempt}/5), will retry with exponential backoff`);
        
        // Let BullMQ handle the retry with exponential backoff
        throw error;
      }
      
      // Check if it's a temporary error that should be retried
      if (error.message?.includes('network') || error.message?.includes('timeout') || error.message?.includes('503') || error.message?.includes('502')) {
        console.warn(`⚠️ Temporary error for Polar ingestion (attempt ${attempt}/5): ${error.message}`);
        throw error;
      }
      
      // For other errors, log and don't retry to avoid infinite loops
      console.error(`❌ Permanent error in Polar ingestion for user ${userId}:`, {
        error: error.message,
        stack: error.stack,
        campaignId: eventData.campaignId,
        subscriberId: eventData.subscriberId
      });
      
      // Don't throw - mark as completed but failed to avoid retry
      return;
    }
  },
  {
    connection: connectionForWorker,
    concurrency: 2, // Low concurrency to respect rate limits
  }
);

// ----------------- DLQ Retry Helpers -----------------

export async function retryFailedBatches(campaignId?: string, limit = 100) {
  const jobs = await batchDlqQueue.getJobs(['waiting', 'failed'], 0, limit - 1);

  let retriedCount = 0;
  for (const job of jobs) {
    const data = job.data.originalJobData;

    if (campaignId && data.campaignId !== campaignId) continue;

    await batchQueue.add('process-batch' as const, data, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 10000 }, // Longer backoff
      priority: 2,
    });

    await job.remove();
    retriedCount++;
  }

  return retriedCount;
}

/**
 * Optimized DLQ retry: Classify bounces, single retry, parallel batches, Redis-only state.
 */
export async function retryFailedEmailsFromDLQ(
  campaignId: string,
  maxRetries = 1, // Reduced to 1 total (prevents loops)
  batchSize = 50 // Larger for throughput
) {
  console.log(
    `🔥 Starting optimized DLQ email retry for campaign ${campaignId}...`
  );

  try {
    // Use Redis for DLQ state (no full scan)
    const dlqData = await getDlqEmailsFromRedis(campaignId);
    const campaignFailedEmails = Object.entries(dlqData).filter(
      ([_, data]: [string, any]) =>
        data.status === 'failed' && !data.isPermanentBounce // Skip classified permanents
    );

    if (campaignFailedEmails.length === 0) {
      console.log(
        `✨ No retryable failed emails in DLQ for campaign ${campaignId}`
      );
      return { retriedCount: 0, successCount: 0, finalFailureCount: 0 };
    }

    console.log(
      `🔥 Found ${campaignFailedEmails.length} retryable emails in DLQ for campaign ${campaignId}`
    );

    // Get campaign data once
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { template: true },
    });

    if (!campaign || !campaign.template) {
      console.error(
        `❌ Campaign or template not found for DLQ retry: ${campaignId}`
      );
      return { retriedCount: 0, successCount: 0, finalFailureCount: 0 };
    }

    let retriedCount = 0;
    let successCount = 0;
    let finalFailureCount = 0;

    // Parallel batch processing with Promise.allSettled
    const batchPromises = [];
    for (let i = 0; i < campaignFailedEmails.length; i += batchSize) {
      const batch = campaignFailedEmails.slice(i, i + batchSize);
      batchPromises.push(
        (async () => {
          console.log(
            `🔥📦 Processing DLQ retry batch ${Math.floor(i / batchSize) + 1} (${batch.length} emails)`
          );

          const emailPromises = batch.map(
            async ([emailKey, failedEmailData]: [string, any]) => {
              const {
                subscriberId,
                email,
                templateHtml,
                subject,
                fromName,
                fromEmail,
                replyTo,
              } = failedEmailData;

              // Check if email was already successfully sent to prevent duplicates
              const sentKey = `sent:${campaignId}:${subscriberId}`;
              const alreadySent = await redisForDlq.get(sentKey);

              if (alreadySent) {
                console.log(
                  `📧 DLQ: Email already sent to ${email} for campaign ${campaignId}, skipping retry`
                );
                successCount++; // Count as success since it was already sent
                return;
              }

              retriedCount++;

              for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                  // Acquire rate limit using enhanced rate limiter
                  const emailType = 'marketing';
                  const rateLimitResult =
                    await enhancedRateLimiter.acquire(emailType);
                  if (!rateLimitResult.allowed) {
                    if (attempt === maxRetries) {
                      finalFailureCount++;
                      await classifyAndUpdateDlq(
                        campaignId,
                        subscriberId,
                        email,
                        'rate_limit_exceeded',
                        'Rate limit permanent failure'
                      );
                      return;
                    }
                    await new Promise((r) => setTimeout(r, 10000 * attempt)); // 10s+ backoff
                    continue;
                  }

                  const subscriber = await prisma.subscriber.findUnique({
                    where: { id: subscriberId },
                  });
                  if (!subscriber || subscriber.status !== 'ACTIVE') {
                    finalFailureCount++;
                    await classifyAndUpdateDlq(
                      campaignId,
                      subscriberId,
                      email,
                      'subscriber_inactive',
                      'Inactive subscriber'
                    );
                    return;
                  }

                  const personalizedHtml = replaceVariables(
                    templateHtml,
                    subscriber
                  );
                  const personalizedSubject = replaceVariables(
                    subject,
                    subscriber
                  );
                  const messageId = `${campaignId}-${subscriberId}-dlq-retry-${Date.now()}`;

                  // Send with enhanced error classification
                  const sesResult = await sendEmail({
                    to: [email],
                    subject: personalizedSubject,
                    html: personalizedHtml,
                    from: `${fromName} <${fromEmail}>`,
                    replyTo,
                    campaignId,
                    messageId,
                  });

                  if (!sesResult.success && sesResult.error) {
                    // Use the enhanced error classifier
                    const errorHandlingResult =
                      await emailErrorClassifier.handleEmailError(
                        sesResult.error,
                        email,
                        campaignId,
                        subscriberId
                      );

                    console.error(
                      `🔥❌ [DLQ Retry ${attempt}/${maxRetries}] Failed for ${email}:`,
                      {
                        error: errorHandlingResult.classified.message,
                        errorType: errorHandlingResult.classified.type,
                        shouldRetry: errorHandlingResult.shouldRetry,
                        suppressionAdded: errorHandlingResult.suppressionAdded,
                      }
                    );

                    // Don't retry if permanent error or suppressed
                    if (
                      !errorHandlingResult.shouldRetry ||
                      errorHandlingResult.suppressionAdded
                    ) {
                      finalFailureCount++;
                      return;
                    }

                    if (attempt === maxRetries) {
                      finalFailureCount++;
                      return; // Error classifier already handled the failure
                    }

                    // Use intelligent backoff
                    const backoffDelay =
                      errorHandlingResult.retryDelay || 30000 * attempt;
                    await new Promise((r) => setTimeout(r, backoffDelay));
                    continue;
                  } else {
                    successCount++;

                    // Mark email as successfully sent to prevent future duplicates
                    const sentKey = `sent:${campaignId}:${subscriberId}`;
                    const messageId = `${campaignId}-${subscriberId}-dlq-retry-${Date.now()}`;
                    await redisForDlq.setex(
                      sentKey,
                      2 * 24 * 60 * 60,
                      messageId
                    ); // 2 days expiration

                    await updateDlqEmailInRedis(
                      campaignId,
                      subscriberId,
                      email,
                      {
                        status: 'retried_success',
                        retriedAt: new Date().toISOString(),
                        retryAttempt: attempt,
                      }
                    );

                    // Queue SENT event for Polar ingestion to avoid rate limits
                    try {
                      const campaign = await prisma.campaign.findUnique({
                        where: { id: campaignId },
                        select: { userId: true },
                      });

                      if (campaign?.userId) {
                        await addPolarIngestionJob(campaign.userId, 'SENT', {
                          campaignId,
                          subscriberId,
                          metadata: {
                            messageId,
                            recipientEmail: email,
                            timestamp: new Date().toISOString(),
                            source: 'dlq_retry',
                          },
                        });
                        console.log(
                          `🔵 DLQ retry SENT event queued for Polar ingestion - campaign: ${campaignId}`
                        );
                      }
                    } catch (queueError) {
                      console.error(
                        '❌ Error queuing DLQ retry SENT event for Polar ingestion:',
                        queueError
                      );
                      // Don't fail the retry - email was sent successfully
                    }

                    // Pace: Honor SES throttling
                    if (rateLimitResult.nextRequestDelay > 0) {
                      await new Promise((r) =>
                        setTimeout(r, rateLimitResult.nextRequestDelay)
                      );
                    }
                    return;
                  }
                } catch (error) {
                  if (attempt === maxRetries) {
                    finalFailureCount++;
                    await classifyAndUpdateDlq(
                      campaignId,
                      subscriberId,
                      email,
                      'retry_failed',
                      (error as Error).message
                    );
                  } else {
                    await new Promise((r) => setTimeout(r, 30000 * attempt));
                  }
                }
              }
            }
          );

          await Promise.allSettled(emailPromises);
        })()
      );

      // Stagger batches
      if (batchPromises.length > 1)
        await new Promise((r) => setTimeout(r, 5000));
    }

    await Promise.allSettled(batchPromises);

    console.log(
      `🔥✅ DLQ retry completed: processed=${retriedCount}, success=${successCount}, failures=${finalFailureCount}`
    );

    return { retriedCount, successCount, finalFailureCount };
  } catch (error) {
    console.error(`🔥💥 DLQ retry error for ${campaignId}:`, error);
    throw error;
  }
}

// Helper: Classify permanent bounces (SES codes: 5xx, invalid recipient, etc.)
function isPermanentBounce(errorCode: string): boolean {
  const permanentCodes = [
    'InvalidRecipient',
    'MessageRejected',
    '5.',
    '550',
    '553',
  ];
  return permanentCodes.some((code) => errorCode.includes(code));
}

// Wrapper for DLQ updates with classification
async function classifyAndUpdateDlq(
  campaignId: string,
  subscriberId: string,
  email: string,
  status: string,
  error?: string,
  extra?: any
) {
  await updateDlqEmailInRedis(campaignId, subscriberId, email, {
    status,
    finalFailedAt: new Date().toISOString(),
    finalError: error,
    ...extra,
  });

  // Create event if bounced
  if (status.includes('bounce') || status === 'permanent_bounce') {
    await prisma.event.create({
      data: {
        type: 'BOUNCED',
        data: { email, error, timestamp: new Date().toISOString() },
        subscriberId,
        campaignId,
      },
    });
    await broadcastEvent(campaignId, {
      /* event */
    });
  }
}

// ----------------- Worker Event Listeners -----------------

campaignWorker.on('completed', (job) =>
  console.log(`✅ Campaign job ${job.id} completed (batches queued)`)
);
campaignWorker.on('failed', (job, err) =>
  console.error(`❌ Campaign job ${job?.id} failed: ${err.message}`)
);

batchWorker.on('completed', (job) =>
  console.log(
    `✅ Batch ${job.data.batchNumber} of campaign ${job.data.campaignId} completed`
  )
);
batchWorker.on('failed', (job, err) =>
  console.error(`❌ Batch job ${job?.id} failed: ${err.message}`)
);

// Polar ingestion worker event listeners
polarIngestionWorker.on('completed', (job) =>
  console.log(`✅ Polar ingestion job ${job.id} completed for user ${job.data.userId}`)
);
polarIngestionWorker.on('failed', (job, err) =>
  console.error(`❌ Polar ingestion job ${job?.id} failed: ${err.message}`)
);

// ----------------- Queue Management -----------------

export async function addCampaignToQueue(
  campaignId: string,
  userId: string,
  options?: { batchSize?: number }
) {
  const job = await campaignQueue.add(
    'process-campaign' as const,
    { campaignId, userId, batchSize: options?.batchSize || 100 },
    { priority: 1 }
  );
  return job;
}

// Add SENT event to Polar ingestion queue
export async function addPolarIngestionJob(
  userId: string,
  eventType: string,
  eventData: {
    campaignId: string;
    subscriberId: string;
    metadata?: Record<string, any>;
  }
) {
  const job = await polarIngestionQueue.add(
    'ingest-sent-event' as const,
    {
      userId,
      eventType,
      eventData,
      queuedAt: new Date().toISOString(),
    },
    {
      priority: 10, // High priority for SENT events
      delay: Math.floor(Math.random() * 1000), // Small random delay to spread load
    }
  );
  return job;
}

// ----------------- Graceful Shutdown -----------------

const shutdown = async () => {
  console.log('👋 Closing queues/workers...');
  await Promise.all([
    campaignQueue.close(),
    batchQueue.close(),
    dlqQueue.close(),
    batchDlqQueue.close(),
    polarIngestionQueue.close(),
    campaignWorker.close(),
    batchWorker.close(),
    polarIngestionWorker.close(),
  ]);
  console.log('✅ Queues and workers closed');
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ----------------- Redis DLQ Helper Functions -----------------

/**
 * Update DLQ email status in Redis
 */
async function updateDlqEmailInRedis(
  campaignId: string,
  subscriberId: string,
  email: string,
  updateData: any
): Promise<void> {
  try {
    const dlqKey = `dlq:${campaignId}`;
    const emailKey = `${subscriberId}:${email}`;

    // Get existing data
    const existingData = await redisForDlq.hget(dlqKey, emailKey);
    const currentData = existingData ? JSON.parse(existingData) : {};

    // Merge with update
    const updatedData = {
      ...currentData,
      ...updateData,
      updatedAt: new Date().toISOString(),
    };

    await redisForDlq.hset(dlqKey, emailKey, JSON.stringify(updatedData));

    // Set expiration for 7 days (shorter for cleanup)
    await redisForDlq.expire(dlqKey, 7 * 24 * 60 * 60);
  } catch (error) {
    console.error('Error updating DLQ email in Redis:', error);
  }
}

/**
 * Get all DLQ emails for a campaign from Redis
 */
export async function getDlqEmailsFromRedis(
  campaignId: string
): Promise<Record<string, any>> {
  try {
    const dlqKey = `dlq:${campaignId}`;
    const dlqData = await redisForDlq.hgetall(dlqKey);

    const parsedData: Record<string, any> = {};
    for (const [emailKey, dataStr] of Object.entries(dlqData)) {
      try {
        parsedData[emailKey] =
          typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;
      } catch (parseError) {
        console.error(`Error parsing DLQ data for ${emailKey}:`, parseError);
      }
    }

    return parsedData;
  } catch (error) {
    console.error('Error getting DLQ emails from Redis:', error);
    return {};
  }
}

/**
 * Get DLQ statistics for a campaign (optimized with counters)
 */
export async function getDlqStats(campaignId: string): Promise<{
  total: number;
  failed: number;
  retried: number;
  retriedSuccess: number;
  retryFailed: number;
  subscriberInactive: number;
  permanentBounces: number;
}> {
  try {
    const dlqData = await getDlqEmailsFromRedis(campaignId);

    const stats = {
      total: Object.keys(dlqData).length,
      failed: 0,
      retried: 0,
      retriedSuccess: 0,
      retryFailed: 0,
      subscriberInactive: 0,
      permanentBounces: 0,
    };

    Object.values(dlqData).forEach((emailData: any) => {
      const { status, isPermanentBounce } = emailData;
      switch (status) {
        case 'failed':
          stats.failed++;
          break;
        case 'retried_success':
          stats.retried++;
          stats.retriedSuccess++;
          break;
        case 'retry_failed':
          stats.retried++;
          stats.retryFailed++;
          break;
        case 'subscriber_inactive':
          stats.subscriberInactive++;
          break;
        case 'permanent_bounce':
          stats.permanentBounces++;
          break;
      }
      if (isPermanentBounce) stats.permanentBounces++;
    });

    // Cache stats in Redis for 1min
    const statsKey = `dlq:stats:${campaignId}`;
    await redisForDlq.set(statsKey, JSON.stringify(stats), 'EX', 60);

    return stats;
  } catch (error) {
    console.error('Error getting DLQ stats:', error);
    return {
      total: 0,
      failed: 0,
      retried: 0,
      retriedSuccess: 0,
      retryFailed: 0,
      subscriberInactive: 0,
      permanentBounces: 0,
    };
  }
}