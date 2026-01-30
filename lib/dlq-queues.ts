import { Queue } from 'bullmq';
import { redis } from './redis';

export type DlqJobName = 'failed-email' | 'failed-batch';

export interface FailedEmailJobData {
  campaignId: string;
  subscriberId: string;
  email: string;
  templateHtml: string;
  subject: string;
  fromEmail: string;
  fromName: string;
  replyTo: string;
  error: string;
  attempts: number;
  failedAt: string;
  errorType: string;
}

export interface FailedBatchJobData {
  originalJobData: any;
  failedReason: string;
  failedAt: string;
  attemptsMade: number;
  jobId?: string | number;
}

/* ---------------- DLQ Queue ---------------- */

export const dlqQueue = new Queue<FailedEmailJobData, void, DlqJobName>(
  'email-dlq',
  {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: 10,
      removeOnFail: 50,
      attempts: 1,
    },
  }
);

export const batchDlqQueue = new Queue<FailedBatchJobData, void, DlqJobName>(
  'batch-dlq',
  {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: 10,
      removeOnFail: 50,
      attempts: 1,
    },
  }
);
