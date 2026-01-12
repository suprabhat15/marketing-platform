import { Queue, Worker, Job } from 'bullmq';
import type { EventType } from '@prisma/client';
import { prisma } from './prisma';
import { BatchEmailProcessor, BatchEmailData } from './batch-email-processor';
import { redis, getRedisInstance } from './redis';
import { dlqQueue, batchDlqQueue } from './dlq-queues';
export type CampaignJobName = 'process-campaign';
export type BatchJobName = 'process-batch';
export type DlqJobName = 'failed-email' | 'failed-batch';
export type PolarJobName = 'ingest-sent-event';

interface CampaignJobData {
  campaignId: string;
  userId: string;
  batchSize?: number;
}

export interface PolarIngestionJobData {
  userId: string;
  eventType: EventType;
  eventData: {
    campaignId: string;
    subscriberId: string;
    metadata?: Record<string, any>;
  };
  queuedAt: string;
}

const sharedRedisConnection = getRedisInstance('default');
const connectionForQueue = sharedRedisConnection;
const connectionForWorker = getRedisInstance('worker');

const defaultJobOptions = {
  removeOnComplete: true,
  removeOnFail: 100,
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
};

const emailQueueConfig = {
  connection: connectionForQueue,
  defaultJobOptions: {
    ...defaultJobOptions,
  },
};

export const campaignQueue = new Queue<CampaignJobData, void, CampaignJobName>(
  'campaign-processing',
  emailQueueConfig
);

export const batchQueue = new Queue<BatchEmailData, void, BatchJobName>(
  'batch-processing',
  emailQueueConfig
);

export const polarIngestionQueue = new Queue<
  PolarIngestionJobData,
  void,
  PolarJobName
>('polar-ingestion', {
  connection: connectionForQueue,
  defaultJobOptions: {
    removeOnComplete: 20,
    removeOnFail: 100,
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
  },
});

export const campaignWorker = new Worker<
  CampaignJobData,
  void,
  CampaignJobName
>(
  'campaign-processing',
  async (job: Job<CampaignJobData, void, CampaignJobName>) => {
    if (job.name !== 'process-campaign') return;

    const { campaignId, userId, batchSize = 100 } = job.data;

    try {
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: {
          id: true,
          templateId: true,
          content: true,
          subject: true,
          fromEmail: true,
          fromName: true,
          replyTo: true,
          userId: true,
          listId: true,
          template: { select: { id: true } },
          list: { include: { subscribers: { where: { status: 'ACTIVE' } } } },
        },
      });
      if (!campaign || (!campaign.templateId && !campaign.content)) {
        throw new Error(
          `Campaign has no template or content for ${campaignId}`
        );
      }

      const subscribers = campaign.list.subscribers;
      if (!subscribers.length) return;

      const { EmailService } = await import('./email-service');
      const creditCheck = await EmailService.checkCreditsBeforeSending(
        userId,
        subscribers.length
      );

      if (!creditCheck.canSend) {
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { status: 'FAILED' },
        });
        throw new Error(
          `Insufficient credits: need ${creditCheck.creditsRequired}, have ${creditCheck.creditsAvailable}`
        );
      }

      const creditsReserved = await EmailService.reserveCreditsForCampaign(
        userId,
        campaignId,
        subscribers.length
      );

      if (!creditsReserved) {
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { status: 'FAILED' },
        });
        throw new Error('Failed to reserve credits for campaign');
      }

      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'SENDING', sentAt: new Date() },
      });

      const pageSize = 5000;
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
          orderBy: { id: 'asc' },
        });
        if (!page.length) break;

        for (let i = 0; i < page.length; i += sendBatchSize) {
          batchNumber++;
          const slice = page.slice(i, i + sendBatchSize);

          bulkBuffer.push({
            name: 'process-batch',
            data: {
              campaignId,
              batchNumber,
              totalBatches,
              subscriberIds: slice.map((s) => s.id),
              templateId: campaign.templateId || undefined,
              templateHtml: campaign.content,
              subject: campaign.subject,
              fromEmail: campaign.fromEmail || process.env.FROM_EMAIL!,
              fromName: campaign.fromName || process.env.FROM_NAME!,
              replyTo: campaign.replyTo || '',
              startIndex: 0,
              endIndex: slice.length,
              userId,
            },
            opts: { delay: batchNumber * 1000 },
          });

          if (bulkBuffer.length >= 50) {
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

export const batchWorker = new Worker<BatchEmailData, void, BatchJobName>(
  'batch-processing',
  async (job: Job<BatchEmailData, void, BatchJobName>) => {
    if (job.name !== 'process-batch') return;

    let timeoutId: NodeJS.Timeout | undefined;
    const jobTimeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error('Batch job timeout')),
        900000
      );
    });

    try {
      const processor = new BatchEmailProcessor(10, 50);
      const processPromise = processor.processBatch(job.data);
      await Promise.race([processPromise, jobTimeout]);

      if (job.data.batchNumber === job.data.totalBatches) {
        const { checkCampaignCompletion } = await import('./queue-helpers');
        setTimeout(() => {
          checkCampaignCompletion(job.data.campaignId).catch((error) => {
            console.error(
              `Error in completion check for campaign ${job.data.campaignId}:`,
              error
            );
          });
        }, 10000);
      }
    } catch (error) {
      console.error(
        `Batch ${job.data.batchNumber} for campaign ${job.data.campaignId} failed:`,
        error
      );

      await batchDlqQueue.add('failed-batch' as const, {
        originalJobData: job.data,
        failedReason: (error as Error).message,
        failedAt: new Date().toISOString(),
        attemptsMade: job.attemptsMade,
        jobId: job.id,
      });
      throw error;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  },
  { connection: connectionForWorker, concurrency: 7 }
);

export const emailWorker = batchWorker;

export const polarIngestionWorker = new Worker<
  PolarIngestionJobData,
  void,
  PolarJobName
>(
  'polar-ingestion',
  async (job) => {
    if (job.name !== 'ingest-sent-event') return;

    const { userId, eventType, eventData } = job.data;

    try {
      const { CreditService } = await import('./credit-service');
      await CreditService.processEmailEvent(userId, eventType, eventData);
    } catch (error: any) {
      if (
        error.message?.includes('429') ||
        error.message?.includes('rate limit') ||
        error.message?.includes('Too Many Requests')
      ) {
        console.warn(
          `⚠️ Rate limit hit for Polar ingestion, will retry with exponential backoff`
        );
        throw error;
      }

      if (
        error.message?.includes('network') ||
        error.message?.includes('timeout') ||
        error.message?.includes('503') ||
        error.message?.includes('502')
      ) {
        console.warn(
          `⚠️ Temporary error for Polar ingestion: ${error.message}`
        );
        throw error;
      }

      console.error(
        `❌ Permanent error in Polar ingestion for user ${userId}:`,
        {
          error: error.message,
          stack: error.stack,
          campaignId: eventData.campaignId,
          subscriberId: eventData.subscriberId,
        }
      );
      return;
    }
  },
  {
    connection: connectionForWorker,
    concurrency: 2,
  }
);
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

export async function addPolarIngestionJob(
  userId: string,
  eventType: EventType,
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
      priority: 10,
      delay: Math.floor(Math.random() * 1000),
    }
  );
  return job;
}

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

polarIngestionWorker.on('completed', (job) => {});
polarIngestionWorker.on('failed', (job, err) =>
  console.error(`❌ Polar ingestion job ${job?.id} failed: ${err.message}`)
);

export const shutdownEmailQueues = async () => {
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
  console.log('✅ Email queues and workers closed');
};