import { Queue } from 'bullmq';
import { redis } from './redis';

// export type DlqFailedEmail = 'failed-email';
// export type DlqFailedBatch = 'failed-batch';


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

export const dlqQueue = new Queue<
  DlqFailedEmailJobMap[keyof DlqFailedEmailJobMap],
  void,
  keyof DlqFailedEmailJobMap
>('email-dlq', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 1000,
    attempts: 1,
  },
});

export const batchDlqQueue = new Queue<
  DlqFailedBatchJobMap[keyof DlqFailedBatchJobMap],
  void,
  keyof DlqFailedBatchJobMap
>('batch-dlq', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 1000,
    attempts: 1,
  },
});
