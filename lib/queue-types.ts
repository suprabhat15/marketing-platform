export type EmailType = 'transactional' | 'marketing' | 'system';

export interface EmailQueueItem {
  id: string;
  type: EmailType;
  to: string;
  from: string;
  subject: string;
  html: string;
  text?: string;
  priority: number;
  retries: number;
  maxRetries: number;
  createdAt: Date;
  scheduledAt?: Date;
}

export interface QueueStatus {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}