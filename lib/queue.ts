import { Queue, Worker, Job } from 'bullmq';
import { prisma } from './prisma';
import { broadcastCampaignUpdate, broadcastEvent } from './event-broadcast';
import { BatchEmailProcessor, BatchEmailData, replaceVariables } from './batch-email-processor';
// import { CampaignProgressTracker } from './campaign-progress';
import { sendEmail } from './ses';
import { globalRateLimiter } from './global-rate-limiter';
import { getRedisInstance } from './redis';

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

    // Check if all batches are complete by getting active/waiting jobs
    const [campaignJobs, batchJobs] = await Promise.all([
      campaignQueue.getJobs(['waiting', 'active'], 0, -1),
      batchQueue.getJobs(['waiting', 'active'], 0, -1)
    ]);
    
    const activeCampaignJobs = campaignJobs.filter(job => job.data.campaignId === campaignId);
    const activeBatchJobs = batchJobs.filter(job => job.data.campaignId === campaignId);

    if (activeCampaignJobs.length > 0 || activeBatchJobs.length > 0) {
      console.log(`Campaign ${campaignId} still has active jobs, not yet complete`);
      return;
    }

    console.log(`\u2705 Campaign ${campaignId} batches complete, checking for DLQ retries...`);

    // Now check for failed emails and retry them
    const allDlqJobs = await dlqQueue.getJobs(['waiting', 'completed', 'failed'], 0, -1);
    const campaignFailedJobs = allDlqJobs.filter(job => 
      job.data.campaignId === campaignId && job.name === 'failed-email'
    );

    if (campaignFailedJobs.length > 0) {
      console.log(`\ud83d\udd25 Found ${campaignFailedJobs.length} failed emails for campaign ${campaignId}, starting DLQ retry...`);
      try {
        await retryFailedEmailsFromDLQ(campaignId);
        await markCampaignComplete(campaignId);
      } catch (dlqError) {
        console.error(`DLQ retry failed for campaign ${campaignId}:`, dlqError);
        await markCampaignComplete(campaignId);
      }
    } else {
      console.log(`\u2728 No failed emails found for campaign ${campaignId}, marking as complete`);
      await markCampaignComplete(campaignId);
    }
  } catch (error) {
    console.error(`Error checking campaign completion for ${campaignId}:`, error);
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

// Use centralized Redis connection manager
const connectionForQueue = getRedisInstance('queue');
const connectionForWorker = getRedisInstance('worker');
const redisForDlq = getRedisInstance('dlq');

const defaultJobOptions = {
  removeOnComplete: true,
  removeOnFail: 500,
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 }
};

export const campaignQueue = new Queue<CampaignJobData>('campaign-processing', {
  connection: connectionForQueue,
  defaultJobOptions,
});
export const batchQueue = new Queue<BatchEmailData>('batch-processing', {
  connection: connectionForQueue,
  defaultJobOptions,
});
export const emailQueue = batchQueue; // Alias for backward compatibility
export const dlqQueue = new Queue<any>('email-dlq', { connection: connectionForQueue });
export const batchDlqQueue = new Queue<any>('batch-dlq', { connection: connectionForQueue });

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

      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'SENDING', sentAt: new Date() },
      });

      const pageSize = 1000;
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
        });
        if (!page.length) break;

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
            name: 'process-batch',
            data: batchData,
            opts: { delay: batchNumber * 10 },
          });

          if (bulkBuffer.length >= 500) {
            await batchQueue.addBulk(bulkBuffer);
            bulkBuffer = [];
          }
        }

        cursor = { id: page[page.length - 1].id };
      }

      if (bulkBuffer.length) await batchQueue.addBulk(bulkBuffer);
    } catch (error) {
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

    try {
      const processor = new BatchEmailProcessor();
      await processor.processBatch(job.data);
      console.log(`\u2705 Batch ${job.data.batchNumber}/${job.data.totalBatches} completed for campaign ${job.data.campaignId}`);
      
      // Only check completion if this is the last batch OR if this batch is significantly delayed
      const shouldCheckCompletion = (
        job.data.batchNumber === job.data.totalBatches || 
        Math.random() < 0.1 // 10% chance to check completion (to handle edge cases)
      );
      
      if (shouldCheckCompletion) {
        // Add a small delay to allow other batches to complete
        setTimeout(() => {
          checkCampaignCompletion(job.data.campaignId).catch(error => {
            console.error(`Error in delayed completion check for campaign ${job.data.campaignId}:`, error);
          });
        }, 2000); // 2 second delay
      }
    } catch (error) {
      console.error(
        `Batch ${job.data.batchNumber} for campaign ${job.data.campaignId} failed:`,
        error
      );

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
  { connection: connectionForWorker, concurrency: 2 }
);

export const emailWorker = batchWorker; // Alias for backward compatibility

// ----------------- DLQ Retry Helpers -----------------

export async function retryFailedBatches(campaignId?: string, limit = 50) {
  const jobs = await batchDlqQueue.getJobs(['waiting', 'failed'], 0, limit - 1);

  let retriedCount = 0;
  for (const job of jobs) {
    const data = job.data.originalJobData;

    if (campaignId && data.campaignId !== campaignId) continue;

    await batchQueue.add('process-batch', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      priority: 2,
    });

    await job.remove();
    retriedCount++;
  }

  return retriedCount;
}

/**
 * Retry failed individual emails from the DLQ after campaign batches complete.
 * This function executes once all batches of a particular campaign are completed.
 * @param campaignId The campaign ID to retry failed emails for
 * @param maxRetries Maximum retry attempts per email (default 2)
 * @param batchSize Number of emails to process in each retry batch (default 25)
 */
export async function retryFailedEmailsFromDLQ(
  campaignId: string,
  maxRetries = 2,
  batchSize = 25
) {
  console.log(`🔥 Starting DLQ email retry for campaign ${campaignId}...`);

  try {
    // Get all failed email jobs for this campaign from DLQ
    const allDlqJobs = await dlqQueue.getJobs(
      ['waiting', 'completed', 'failed'],
      0,
      -1
    );
    const campaignFailedJobs = allDlqJobs.filter(
      (job) => job.data.campaignId === campaignId && job.name === 'failed-email'
    );

    if (campaignFailedJobs.length === 0) {
      console.log(
        `✨ No failed emails found in DLQ for campaign ${campaignId}`
      );
      return { retriedCount: 0, successCount: 0, finalFailureCount: 0 };
    }

    console.log(
      `🔥 Found ${campaignFailedJobs.length} failed emails in DLQ for campaign ${campaignId}`
    );

    // Get campaign and template data for retry
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

    // Process failed emails in batches
    for (let i = 0; i < campaignFailedJobs.length; i += batchSize) {
      const batch = campaignFailedJobs.slice(i, i + batchSize);
      console.log(
        `🔥📦 Processing DLQ retry batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(campaignFailedJobs.length / batchSize)} (${batch.length} emails)`
      );

      // Process each email in the batch with retry logic
      const batchPromises = batch.map(async (dlqJob) => {
        const failedEmailData = dlqJob.data;
        retriedCount++;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            console.log(
              `🔥🔄 [DLQ Retry ${attempt}/${maxRetries}] Attempting to send email to ${failedEmailData.email}`
            );

            // Acquire rate limit permit
            const rateLimitResult = await globalRateLimiter.acquire();

            if (!rateLimitResult.allowed) {
              console.warn(
                `🔥⚠️ [DLQ Retry ${attempt}] Rate limit exceeded for ${failedEmailData.email}`
              );

              if (attempt === maxRetries) {
                console.error(
                  `🔥❌ [DLQ FINAL FAILURE] Rate limit exceeded after ${maxRetries} DLQ attempts for ${failedEmailData.email}`
                );
                finalFailureCount++;

                // Update Redis with final failure
                await updateDlqEmailInRedis(
                  campaignId,
                  failedEmailData.subscriberId,
                  failedEmailData.email,
                  {
                    status: 'retry_failed',
                    finalFailedAt: new Date().toISOString(),
                    finalError: 'Rate limit exceeded in DLQ retry',
                    totalRetryAttempts: maxRetries,
                  }
                );

                // Create bounced event for failed email
                try {
                  const failedEvent = await prisma.event.create({
                    data: {
                      type: 'BOUNCED',
                      data: {
                        email: failedEmailData.email,
                        messageId: `${campaignId}-${failedEmailData.subscriberId}-dlq-failure`,
                        timestamp: new Date().toISOString(),
                        error: 'Rate limit exceeded in DLQ retry',
                        retryAttempts: maxRetries,
                      },
                      subscriberId: failedEmailData.subscriberId,
                      campaignId,
                    },
                    include: {
                      subscriber: {
                        select: {
                          email: true,
                          firstName: true,
                          lastName: true,
                        },
                      },
                    },
                  });

                  await broadcastEvent(campaignId, failedEvent);
                } catch (eventError) {
                  console.error(
                    'Error creating failed event for DLQ:',
                    eventError
                  );
                }

                // await CampaignProgressTracker.incrementFailed(campaignId, 1);
                return;
              }

              // Exponential backoff for DLQ retries
              const backoffDelay = Math.min(
                2000 * Math.pow(2, attempt - 1),
                20000
              );
              console.log(
                `🔥⏳ [DLQ Retry ${attempt}] Waiting ${backoffDelay}ms before retry for ${failedEmailData.email}`
              );
              await new Promise((resolve) => setTimeout(resolve, backoffDelay));
              continue;
            }

            console.log(
              `🔥✅ [DLQ Retry ${attempt}] Rate limit acquired for ${failedEmailData.email}`
            );

            // Get subscriber details
            const subscriber = await prisma.subscriber.findUnique({
              where: { id: failedEmailData.subscriberId },
            });

            if (!subscriber || subscriber.status !== 'ACTIVE') {
              console.warn(
                `🔥⚠️ Subscriber ${failedEmailData.subscriberId} not found or inactive, skipping DLQ retry`
              );
              finalFailureCount++;

              // Update Redis with subscriber status issue
              await updateDlqEmailInRedis(
                campaignId,
                failedEmailData.subscriberId,
                failedEmailData.email,
                {
                  status: 'subscriber_inactive',
                  finalFailedAt: new Date().toISOString(),
                  finalError: subscriber
                    ? 'Subscriber inactive'
                    : 'Subscriber not found',
                }
              );

              // Create bounced event for inactive/missing subscriber
              try {
                const failedEvent = await prisma.event.create({
                  data: {
                    type: 'BOUNCED',
                    data: {
                      email: failedEmailData.email,
                      messageId: `${campaignId}-${failedEmailData.subscriberId}-subscriber-inactive`,
                      timestamp: new Date().toISOString(),
                      error: subscriber
                        ? 'Subscriber inactive'
                        : 'Subscriber not found',
                      retryAttempts: 0,
                    },
                    subscriberId: failedEmailData.subscriberId,
                    campaignId,
                  },
                });

                await broadcastEvent(campaignId, failedEvent);
              } catch (eventError) {
                console.error(
                  'Error creating failed event for inactive subscriber:',
                  eventError
                );
              }

              // await CampaignProgressTracker.incrementFailed(campaignId, 1);
              return;
            }

            const personalizedHtml = replaceVariables(
              failedEmailData.templateHtml,
              subscriber
            );
            const personalizedSubject = replaceVariables(
              failedEmailData.subject,
              subscriber
            );

            // Send the email
            const messageId = `${campaignId}-${failedEmailData.subscriberId}-dlq-${Date.now()}`;

            await sendEmail({
              to: [failedEmailData.email],
              subject: personalizedSubject,
              html: personalizedHtml,
              from: `${failedEmailData.fromName} <${failedEmailData.fromEmail}>`,
              replyTo: failedEmailData.replyTo,
              campaignId,
              messageId,
            });

            console.log(
              `🔥✓ [DLQ SUCCESS] Email sent to ${failedEmailData.email} for campaign ${campaignId} after ${attempt} DLQ attempt(s)`
            );

            // Increment sent count and mark as success
            // await CampaignProgressTracker.incrementSent(campaignId, 1);
            successCount++;

            // Ingest credit usage to Polar for DLQ retry success
            try {
              const { ingestEvent } = await import('./polar');
              await ingestEvent({
                name: 'credits',
                externalCustomerId: campaign.userId,
                metadata: {
                  campaignId,
                  subscriberEmail: failedEmailData.email,
                  source: 'email_campaign_dlq_retry',
                  dlqRetryAttempt: attempt,
                  timestamp: new Date().toISOString(),
                },
              });
              console.log(
                `💰 DLQ retry credit ingested for user ${campaign.userId} (campaign: ${campaignId}, email: ${failedEmailData.email})`
              );
            } catch (error) {
              console.error(
                `❌ Failed to ingest DLQ retry credit for user ${campaign.userId}:`,
                error
              );
            }

            // Update Redis with successful retry
            await updateDlqEmailInRedis(
              campaignId,
              failedEmailData.subscriberId,
              failedEmailData.email,
              {
                status: 'retried_success',
                retriedAt: new Date().toISOString(),
                retryAttempt: attempt,
              }
            );

            // Remove from DLQ after successful send
            try {
              await dlqJob.remove();
              console.log(
                `🔥🗑️ Removed ${failedEmailData.email} from DLQ after successful retry`
              );
            } catch (removeError) {
              console.error(`🔥⚠️ Failed to remove job from DLQ:`, removeError);
            }

            // Apply pacing for DLQ processing
            if (
              rateLimitResult.nextRequestDelay &&
              rateLimitResult.nextRequestDelay > 0
            ) {
              console.log(
                `🔥⏱️ Applying DLQ pacing delay: ${rateLimitResult.nextRequestDelay}ms`
              );
              await new Promise((resolve) =>
                setTimeout(resolve, rateLimitResult.nextRequestDelay)
              );
            }

            return; // Success - exit retry loop
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            console.error(
              `🔥❌ [DLQ Retry ${attempt}/${maxRetries}] Failed to send email to ${failedEmailData.email}:`,
              errorMessage
            );

            if (attempt === maxRetries) {
              console.error(
                `🔥❌ [DLQ FINAL FAILURE] Email send failed after ${maxRetries} DLQ attempts for ${failedEmailData.email}`
              );
              finalFailureCount++;

              // Update Redis with final failure
              await updateDlqEmailInRedis(
                campaignId,
                failedEmailData.subscriberId,
                failedEmailData.email,
                {
                  status: 'retry_failed',
                  finalFailedAt: new Date().toISOString(),
                  finalError: errorMessage,
                  totalRetryAttempts: maxRetries,
                }
              );

              // await CampaignProgressTracker.incrementFailed(campaignId, 1);

              // Create final failure event
              try {
                const finalFailedEvent = await prisma.event.create({
                  data: {
                    type: 'BOUNCED',
                    data: {
                      email: failedEmailData.email,
                      messageId: `${campaignId}-${failedEmailData.subscriberId}-dlq-final-failure`,
                      timestamp: new Date().toISOString(),
                      error: errorMessage,
                      retryAttempts: maxRetries,
                      isDlqFinalFailure: true,
                    },
                    subscriberId: failedEmailData.subscriberId,
                    campaignId,
                  },
                  include: {
                    subscriber: {
                      select: {
                        email: true,
                        firstName: true,
                        lastName: true,
                      },
                    },
                  },
                });

                await broadcastEvent(campaignId, finalFailedEvent);
              } catch (eventError) {
                console.error(
                  '🔥⚠️ Error creating DLQ final failure event:',
                  eventError
                );
              }

              break;
            }

            // Exponential backoff for DLQ retries
            const backoffDelay = Math.min(
              2000 * Math.pow(2, attempt - 1),
              20000
            );
            console.log(
              `🔥⏳ [DLQ Retry ${attempt}] Waiting ${backoffDelay}ms before retry due to error: ${errorMessage}`
            );
            await new Promise((resolve) => setTimeout(resolve, backoffDelay));
          }
        }
      });

      // Wait for batch to complete before processing next batch
      await Promise.allSettled(batchPromises);

      // Add delay between batches to avoid overwhelming the system
      if (i + batchSize < campaignFailedJobs.length) {
        console.log(
          `🔥⏸️ Waiting 3 seconds before processing next DLQ retry batch...`
        );
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    console.log(`🔥✅ DLQ retry completed for campaign ${campaignId}:`);
    console.log(`   📊 Total processed: ${retriedCount}`);
    console.log(`   ✅ Successful retries: ${successCount}`);
    console.log(`   ❌ Final failures: ${finalFailureCount}`);

    return { retriedCount, successCount, finalFailureCount };
  } catch (error) {
    console.error(
      `🔥💥 Error during DLQ retry for campaign ${campaignId}:`,
      error
    );
    throw error;
  }
}

// ----------------- Worker Event Listeners -----------------

campaignWorker.on('completed', job => console.log(`✅ Campaign job ${job.id} completed (batches queued)`));
campaignWorker.on('failed', (job, err) => console.error(`❌ Campaign job ${job?.id} failed: ${err.message}`));

batchWorker.on('completed', job =>
  console.log(`✅ Batch ${job.data.batchNumber} of campaign ${job.data.campaignId} completed`)
);
batchWorker.on('failed', (job, err) => console.error(`❌ Batch job ${job?.id} failed: ${err.message}`));

// ----------------- Queue Management -----------------

export async function addCampaignToQueue(campaignId: string, userId: string, options?: { batchSize?: number }) {
  const job = await campaignQueue.add(
    'process-campaign',
    { campaignId, userId, batchSize: options?.batchSize || 100 },
    { priority: 1 }
  );
  return job;
}



// ----------------- Graceful Shutdown -----------------

const shutdown = async () => {
  console.log('👋 Closing queues/workers...');
  await Promise.all([
    campaignQueue.close(),
    batchQueue.close(),
    campaignWorker.close(),
    batchWorker.close()
  ]);
  // Redis connections managed by RedisConnectionManager
  console.log('✅ Queues and workers closed');
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ----------------- Redis DLQ Helper Functions -----------------

/**
 * Update DLQ email status in Redis
 */
async function updateDlqEmailInRedis(campaignId: string, subscriberId: string, email: string, updateData: any): Promise<void> {
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
      updatedAt: new Date().toISOString()
    };
    
    await redisForDlq.hset(dlqKey, emailKey, JSON.stringify(updatedData));
    
    // Set expiration for 30 days
    await redisForDlq.expire(dlqKey, 30 * 24 * 60 * 60);
  } catch (error) {
    console.error('Error updating DLQ email in Redis:', error);
  }
}

/**
 * Get all DLQ emails for a campaign from Redis
 */
export async function getDlqEmailsFromRedis(campaignId: string): Promise<Record<string, any>> {
  try {
    const dlqKey = `dlq:${campaignId}`;
    const dlqData = await redisForDlq.hgetall(dlqKey);
    
    const parsedData: Record<string, any> = {};
    for (const [emailKey, dataStr] of Object.entries(dlqData)) {
      try {
        parsedData[emailKey] = (typeof dataStr === 'string') ? JSON.parse(dataStr) : dataStr;
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
 * Get DLQ statistics for a campaign
 */
export async function getDlqStats(campaignId: string): Promise<{
  total: number;
  failed: number;
  retried: number;
  retriedSuccess: number;
  retryFailed: number;
  subscriberInactive: number;
}> {
  try {
    const dlqData = await getDlqEmailsFromRedis(campaignId);
    
    const stats = {
      total: Object.keys(dlqData).length,
      failed: 0,
      retried: 0,
      retriedSuccess: 0,
      retryFailed: 0,
      subscriberInactive: 0
    };
    
    Object.values(dlqData).forEach((emailData: any) => {
      switch (emailData.status) {
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
      }
    });
    
    return stats;
  } catch (error) {
    console.error('Error getting DLQ stats:', error);
    return {
      total: 0,
      failed: 0,
      retried: 0,
      retriedSuccess: 0,
      retryFailed: 0,
      subscriberInactive: 0
    };
  }
}
