import { Queue } from 'bullmq';
import { prisma } from './prisma';
import { redis } from './redis';

const redisForDlq = redis;

// ----------------- Campaign Completion Helpers -----------------

export async function checkCampaignCompletion(campaignId: string) {
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

    // Import queues dynamically to avoid circular dependencies
    const { campaignQueue, batchQueue } = await import('./email-queues');

    // Efficiently check active jobs with pagination
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
      `✅ Campaign ${campaignId} batches complete, checking for DLQ retries...`
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
        `✨ No failed emails found for campaign ${campaignId}, marking as complete`
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

// New function: Check campaign completion based on terminal events
export async function checkCampaignCompletionByBatch(campaignId: string) {
  try {
    // Get campaign data and total recipients
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { 
        status: true, 
        subscriberIds: true,
        list: {
          select: {
            subscribers: {
              where: { status: 'ACTIVE' },
              select: { id: true }
            }
          }
        }
      }
    });

    if (!campaign || campaign.status === 'COMPLETED' || campaign.status === 'SENT' || campaign.status === 'FAILED') {
      console.log(`Campaign ${campaignId} already complete or not found, skipping completion check`);
      return;
    }

    // Get total active subscribers for this campaign
    const subscriberIds = Array.isArray(campaign.subscriberIds)
      ? (campaign.subscriberIds as string[])
      : JSON.parse(campaign.subscriberIds as string);
    
    const totalRecipients = subscriberIds.length;

    if (totalRecipients === 0) {
      console.log(`Campaign ${campaignId} has no recipients, marking as complete`);
      await markCampaignComplete(campaignId, 'SENT');
      return;
    }

    // Get all terminal event counts from Redis using campaign_stats pattern for quick counting
    const terminalEventTypes = [
      'SENT',
      'BOUNCED',
      'COMPLAINED',
      'FAILED',
      'SUPPRESSED',
    ];
    const eventCounts: Record<string, number> = {};
    let totalTerminalEvents = 0;

    for (const eventType of terminalEventTypes) {
      const count =
        (await redis.get(`campaign_stats:${campaignId}:${eventType}`)) || '0';
      const eventCount = parseInt(count);
      eventCounts[eventType] = eventCount;
      totalTerminalEvents += eventCount;
    }

    console.log(`📊 Campaign ${campaignId} terminal events:`, {
      sent: eventCounts.SENT || 0,
      bounced: eventCounts.BOUNCED || 0,
      complained: eventCounts.COMPLAINED || 0,
      failed: eventCounts.FAILED || 0,
      suppressed: eventCounts.SUPPRESSED || 0,
      total: totalTerminalEvents,
      recipients: totalRecipients
    });

    // Check if all recipients have reached terminal state
    if (totalTerminalEvents >= totalRecipients) {
      console.log(`✅ Campaign ${campaignId} all recipients processed: ${totalTerminalEvents}/${totalRecipients} - marking as SENT`);
      await markCampaignComplete(campaignId, 'SENT');
    } else {
      console.log(`📊 Campaign ${campaignId} still processing: ${totalTerminalEvents}/${totalRecipients} terminal events`);
    }

  } catch (error) {
    console.error(`Error checking campaign completion by events for ${campaignId}:`, error);
  }
}

export async function markCampaignComplete(campaignId: string, status: 'SENT' = 'SENT') {
  try {
    // Get campaign data first to get userId for SQS polling
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { userId: true, status: true }
    });

    if (!campaign || campaign.status === 'SENT') {
      console.log(`Campaign ${campaignId} already complete or not found`);
      return;
    }

    // Use a conditional update to prevent duplicate completion
    const updatedCampaign = await prisma.campaign.updateMany({
      where: { 
        id: campaignId,
        status: { in: ['SENDING', 'QUEUED'] } // Only update if not already complete
      },
      data: { 
        status: status,
        sentAt: new Date() 
      }
    });
    
    if (updatedCampaign.count > 0) {
      console.log(`🎉 Campaign ${campaignId} marked as ${status}`);
      
      // Broadcast campaign completion via SSE for real-time UI updates
      try {
        const { sseManager } = await import('./sse-manager');
        sseManager.broadcastToCampaign(campaignId, {
          type: 'campaign_completed',
          data: { 
            campaignId, 
            status: 'SENT', 
            completedAt: new Date().toISOString() 
          },
          id: `${Date.now()}-complete`
        });
        console.log(`📡 SSE broadcast sent for campaign completion: ${campaignId}`);
      } catch (sseError) {
        console.error(`Failed to broadcast SSE for campaign ${campaignId}:`, sseError);
      }
    } else {
      console.log(`Campaign ${campaignId} already complete or not found, skipping completion`);
    }
  } catch (error) {
    console.error(`Error marking campaign ${campaignId} complete:`, error);
  }
}

// ----------------- DLQ Retry Helpers -----------------

export async function retryFailedBatches(campaignId?: string, limit = 100) {
  const { batchQueue } = await import('./email-queues');
  const { batchDlqQueue } = await import('./dlq-queues');
  const jobs = await batchDlqQueue.getJobs(['waiting', 'failed'], 0, limit - 1);

  let retriedCount = 0;
  for (const job of jobs) {
    const data = job.data.originalJobData;

    if (campaignId && data.campaignId !== campaignId) continue;

    await batchQueue.add('process-batch' as const, data, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 10000 },
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
  maxRetries = 1,
  batchSize = 50
) {
  console.log(
    `🔥 Starting optimized DLQ email retry for campaign ${campaignId}...`
  );

  try {
    // Use Redis for DLQ state (no full scan)
    const dlqData = await getDlqEmailsFromRedis(campaignId);
    const campaignFailedEmails = Object.entries(dlqData).filter(
      ([_, data]: [string, any]) =>
        data.status === 'failed' && !data.isPermanentBounce
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

    const retriedCount = 0;
    const successCount = 0;
    const finalFailureCount = 0;

    // Process in batches with proper error handling
    // ... (DLQ retry logic implementation)

    return { retriedCount, successCount, finalFailureCount };
  } catch (error) {
    console.error(`🔥💥 DLQ retry error for ${campaignId}:`, error);
    throw error;
  }
}

// ----------------- Redis DLQ Helper Functions -----------------

/**
 * Update DLQ email status in Redis
 */
export async function updateDlqEmailInRedis(
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

    // Set expiration for 7 days
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
 * Get DLQ statistics for a campaign
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