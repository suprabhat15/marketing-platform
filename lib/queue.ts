import { Queue, Worker, Job } from 'bullmq';
import { redis } from './redis';
import { prisma } from './prisma';
import { broadcastCampaignUpdate } from './event-broadcast';
import { BatchEmailProcessor, BatchEmailData } from './batch-email-processor';
import { CampaignProgressTracker } from './campaign-progress';

// Rate limiting is now handled by the global rate limiter
// No need for local rate limiting functions

// Template variable replacement is now handled by BatchEmailProcessor

// Function to check if a campaign is complete and update its status
async function checkCampaignCompletion(campaignId: string) {
  try {
    // Check if campaign is complete using Redis progress tracker
    const isComplete = await CampaignProgressTracker.checkAndMarkComplete(campaignId);
    
    if (isComplete) {
      // Update database status
      await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: 'SENT',
          sentAt: new Date()
        }
      });
      
      // Broadcast campaign completion
      await broadcastCampaignUpdate(campaignId, 'SENT');
    }

  } catch (error) {
    console.error(`Error checking campaign completion for ${campaignId}:`, error);
  }
}

// Define job data interfaces
interface CampaignJobData {
  campaignId: string;
  userId: string;
  batchSize?: number;
}

// BatchJobData is now defined in batch-email-processor.ts as BatchEmailData

// Individual email jobs are no longer needed - processing is done in batches

// Queue configuration
const redisConfig = {
  host: process.env.REDIS_URL?.replace('redis://', '').split(':')[0] || 'localhost',
  port: 6379,
  // password: process.env.REDIS_PASSWORD,
};

const defaultJobOptions = {
  removeOnComplete: true,
  removeOnFail: 500,
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000,
  },
};

// Create queues
export const campaignQueue = new Queue<CampaignJobData>('campaign-processing', {
  connection: redisConfig,
  defaultJobOptions,
});
export const batchQueue = new Queue<BatchEmailData>('batch-processing', {
  connection: redisConfig,
  defaultJobOptions,
});
// emailQueue is no longer needed - emails are processed directly in batches

// INFO: When a worker instance is created, it launches the processor immediately

// Create workers
export const campaignWorker = new Worker<CampaignJobData>('campaign-processing', async (job: Job<CampaignJobData>) => {
  if (job.name !== 'process-campaign') return;
  
  console.log(`Processing campaign worker job: ${job.id}`);
  const { campaignId, userId, batchSize = 100 } = job.data;
  
  console.log(`Processing campaign ${campaignId} for user ${userId}`);
  
  try {
    // Get campaign details
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        template: true,
        list: {
          include: {
            subscribers: {
              where: {
                status: 'ACTIVE'
              }
            }
          }
        }
      }
    });

    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    if (!campaign.template) {
      throw new Error(`Template not found for campaign ${campaignId}`);
    }

    const subscribers = campaign.list.subscribers;
    if (subscribers.length === 0) {
      console.log(`No active subscribers found for campaign ${campaignId}`);
      return;
    }

    // Update campaign status
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { 
        status: 'SENDING',
        sentAt: new Date()
      }
    });

    // Initialize progress tracking
    const totalBatches = Math.ceil(subscribers.length / batchSize);
    await CampaignProgressTracker.initializeProgress(campaignId, subscribers.length, totalBatches);
    
    console.log(`Splitting ${subscribers.length} subscribers into ${totalBatches} batches of ${batchSize}`);

    // Split subscribers into batches
    for (let i = 0; i < totalBatches; i++) {
      const startIndex = i * batchSize;
      const endIndex = Math.min(startIndex + batchSize, subscribers.length);
      const batchSubscribers = subscribers.slice(startIndex, endIndex);

      // Add batch job
      await batchQueue.add('process-batch', {
        campaignId,
        batchNumber: i + 1,
        totalBatches,
        subscriberIds: batchSubscribers.map(s => s.id),
        templateHtml: campaign.template.html || campaign.template.content || campaign.content || '',
        subject: campaign.subject,
        fromEmail: process.env.FROM_EMAIL!,
        fromName: process.env.FROM_NAME || 'MailPackr',
        replyTo: process.env.REPLY_TO_EMAIL!,
        startIndex,
        endIndex
      }, {
        delay: i * 1000, // Stagger batches by 1 second
      });
    }

    console.log(`Queued ${totalBatches} batches for campaign ${campaignId}`);

  } catch (error) {
    console.error(`Error processing campaign ${campaignId}:`, error);
    
    // Update campaign status to failed
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'FAILED' }
    });
    
    throw error;
  }
}, { connection: redisConfig, concurrency: 1 });

export const batchWorker = new Worker<BatchEmailData>('batch-processing', async (job: Job<BatchEmailData>) => {
  if (job.name !== 'process-batch') return;
  
  console.log(`Processing batch worker job: ${job.id}`);
  const batchData = job.data;

  try {
    // Use the new batch processor to stream email sends
    const processor = new BatchEmailProcessor();
    await processor.processBatch(batchData);
    
    // Check if campaign is now complete
    await checkCampaignCompletion(batchData.campaignId);

  } catch (error) {
    console.error(`Error processing batch ${batchData.batchNumber} for campaign ${batchData.campaignId}:`, error);
    
    // Mark batch as failed in progress tracker
    await CampaignProgressTracker.incrementFailed(batchData.campaignId, batchData.subscriberIds.length);
    throw error;
  }
}, { connection: redisConfig, concurrency: 2 }); // Allow 2 batches to run concurrently

// emailWorker is no longer needed - emails are processed directly in batches

// Worker event listeners
campaignWorker.on('completed', async (job) => {
  console.log(`Campaign job ${job.id} completed`);
  
  // Campaign job completion just means batches are queued, not that emails are sent
  // We'll check for campaign completion after all emails are sent
});

campaignWorker.on('failed', async (job, err) => {
  console.error(`Campaign job ${job?.id} failed:`, err.message);
});

batchWorker.on('completed', async (job) => {
  const { campaignId, batchNumber, totalBatches } = job.data;
  console.log(`✅ Batch job ${job.id} completed (${batchNumber}/${totalBatches} for campaign ${campaignId})`);
});

batchWorker.on('failed', async (job, err) => {
  console.error(`❌ Batch job ${job?.id} failed:`, err.message);
  
  if (job?.data) {
    const { campaignId } = job.data;
    // Mark campaign as failed
    await CampaignProgressTracker.markFailed(campaignId, err.message);
  }
});

// Queue management functions
export async function addCampaignToQueue(campaignId: string, userId: string, options?: { batchSize?: number }) {
  const job = await campaignQueue.add('process-campaign', {
    campaignId,
    userId,
    batchSize: options?.batchSize || 50
  }, {
    priority: 1,
  });

  // Start on-demand worker when campaign is queued
  try {
    const { startOnDemandWorker } = await import('./on-demand-queue-worker');
    await startOnDemandWorker();
    console.log(`🎯 On-demand worker started for campaign: ${campaignId}`);
  } catch (error) {
    console.error('Failed to start on-demand worker:', error);
    // Don't fail the job queue if worker fails to start
  }

  return job;
}

export async function getQueueStats() {
  const [campaignStats, batchStats] = await Promise.all([
    campaignQueue.getJobs(['waiting', 'active', 'completed', 'failed']),
    batchQueue.getJobs(['waiting', 'active', 'completed', 'failed']),
  ]);

  const getJobCounts = (jobs: Job[]) => {
    return {
      waiting: jobs.filter(j => j.processedOn === undefined && j.finishedOn === undefined).length,
      active: jobs.filter(j => j.processedOn !== undefined && j.finishedOn === undefined).length,
      completed: jobs.filter(j => j.finishedOn !== undefined && j.failedReason === undefined).length,
      failed: jobs.filter(j => j.failedReason !== undefined).length,
    };
  };

  return {
    campaign: getJobCounts(campaignStats),
    batch: getJobCounts(batchStats),
  };
}

export async function getCampaignQueueStatus(campaignId: string) {
  // Get progress from Redis and queue status
  const [progress, campaignJobs, batchJobs] = await Promise.all([
    CampaignProgressTracker.getProgress(campaignId),
    campaignQueue.getJobs(['waiting', 'active', 'completed', 'failed']),
    batchQueue.getJobs(['waiting', 'active', 'completed', 'failed'])
  ]);

  const campaignJob = campaignJobs.find(job => job.data.campaignId === campaignId);
  const relatedBatchJobs = batchJobs.filter(job => job.data.campaignId === campaignId);

  return {
    campaign: {
      status: campaignJob?.finishedOn ? 'completed' : campaignJob?.failedReason ? 'failed' : 'processing',
      job: campaignJob
    },
    batches: {
      total: relatedBatchJobs.length,
      completed: relatedBatchJobs.filter(job => job.finishedOn).length,
      failed: relatedBatchJobs.filter(job => job.failedReason).length,
    },
    progress: progress || {
      totalSubscribers: 0,
      sentCount: 0,
      bouncedCount: 0,
      failedCount: 0,
      processedCount: 0
    }
  };
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, closing queues and workers gracefully...');
  await Promise.all([
    campaignQueue.close(),
    batchQueue.close(),
    campaignWorker.close(),
    batchWorker.close()
  ]);
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, closing queues and workers gracefully...');
  await Promise.all([
    campaignQueue.close(),
    batchQueue.close(),
    campaignWorker.close(),
    batchWorker.close()
  ]);
  process.exit(0);
});