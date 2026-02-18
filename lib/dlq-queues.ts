import { Queue } from 'bullmq';
import { redis } from './redis';

// export type DlqFailedEmail = 'failed-email';
export const DLQ_JOB_NAMES = {
  FAILED_EMAIL: 'failed-email',
} as const;

export type DlqFailedEmail =
  typeof DLQ_JOB_NAMES.FAILED_EMAIL;

export type DlqFailedBatch = 'failed-batch';

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

export const dlqQueue = new Queue<FailedEmailJobData, void, DlqFailedEmail>(
  'email-dlq',
  {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: 10,
      removeOnFail: 1000,
      attempts: 1,
    },
  }
);

export const batchDlqQueue = new Queue<
  FailedBatchJobData,
  void,
  DlqFailedBatch
>('batch-dlq', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 1000,
    attempts: 1,
  },
});
