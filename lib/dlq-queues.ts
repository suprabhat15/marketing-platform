import { Queue } from 'bullmq';
import { bullMQConnection } from './redis';

export type DlqFailedEmailJobMap = {
  'failed-email': FailedEmailJobData;
};

export type DlqFailedBatchJobMap = {
  'failed-batch': FailedBatchJobData;
};

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

const g = globalThis as unknown as {
  __dlqQueue?: Queue<DlqFailedEmailJobMap[keyof DlqFailedEmailJobMap], void, keyof DlqFailedEmailJobMap>;
  __batchDlqQueue?: Queue<DlqFailedBatchJobMap[keyof DlqFailedBatchJobMap], void, keyof DlqFailedBatchJobMap>;
};

const dlqOpts = {
  connection: bullMQConnection,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 1000,
    attempts: 1,
  },
};

if (!g.__dlqQueue) {
  g.__dlqQueue = new Queue<
    DlqFailedEmailJobMap[keyof DlqFailedEmailJobMap],
    void,
    keyof DlqFailedEmailJobMap
  >('email-dlq', dlqOpts);
}

if (!g.__batchDlqQueue) {
  g.__batchDlqQueue = new Queue<
    DlqFailedBatchJobMap[keyof DlqFailedBatchJobMap],
    void,
    keyof DlqFailedBatchJobMap
  >('batch-dlq', dlqOpts);
}

export const dlqQueue = g.__dlqQueue;
export const batchDlqQueue = g.__batchDlqQueue;
