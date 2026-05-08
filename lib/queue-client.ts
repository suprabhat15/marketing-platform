/**
 * Lean producer-only queue client for use in API routes.
 * Only Queue instances (no Workers) — loading this file costs 3 BullMQ connections max.
 * Queue instances are keyed in globalThis and shared with email-queues.ts to prevent doubling.
 */
import { Queue } from 'bullmq';
import type { EventType } from '@prisma/client';
import { bullMQConnection } from './redis';

export type CampaignJobName = 'process-campaign';
export type BatchJobName = 'process-batch';
export type PolarJobName = 'ingest-sent-event';

export interface CampaignJobData {
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

// Same globalThis keys as email-queues.ts — instances are shared if both modules are loaded.
const g = globalThis as unknown as {
  __campaignQueue?: Queue<CampaignJobData, void, CampaignJobName>;
  __batchQueue?: Queue<any, void, BatchJobName>;
  __polarIngestionQueue?: Queue<PolarIngestionJobData, void, PolarJobName>;
};

const defaultJobOptions = {
  removeOnComplete: true,
  removeOnFail: 1000,
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
};

if (!g.__campaignQueue) {
  g.__campaignQueue = new Queue<CampaignJobData, void, CampaignJobName>(
    'campaign-processing',
    { connection: bullMQConnection, defaultJobOptions }
  );
}

if (!g.__batchQueue) {
  g.__batchQueue = new Queue('batch-processing', {
    connection: bullMQConnection,
    defaultJobOptions,
  });
}

if (!g.__polarIngestionQueue) {
  g.__polarIngestionQueue = new Queue<PolarIngestionJobData, void, PolarJobName>(
    'polar-ingestion',
    {
      connection: bullMQConnection,
      defaultJobOptions: {
        removeOnComplete: 20,
        removeOnFail: 1000,
        attempts: 5,
        backoff: { type: 'exponential' as const, delay: 2000 },
      },
    }
  );
}

export const campaignQueue = g.__campaignQueue;
export const batchQueue = g.__batchQueue;
export const polarIngestionQueue = g.__polarIngestionQueue;

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
