// Queue type definitions and email classification
export type EmailType = 'transactional' | 'marketing' | 'system';
export type EmailPriority = 'high' | 'standard' | 'low';

export interface EmailJobData {
  emailId: string;
  campaignId?: string;
  userId: string;
  emailType: EmailType;
  priority: EmailPriority;
  to: string;
  subject: string;
  html: string;
  from: string;
  fromName: string;
  replyTo: string;
  messageId: string;
  subscriberId?: string;
  metadata?: Record<string, any>;
}

export interface CampaignJobData {
  campaignId: string;
  userId: string;
  emailType: EmailType;
  batchSize?: number;
  totalSubscribers?: number;
}

export interface BatchJobData {
  campaignId: string;
  batchNumber: number;
  totalBatches: number;
  subscriberIds: string[];
  templateHtml: string;
  subject: string;
  fromEmail: string;
  fromName: string;
  replyTo: string;
  userId: string;
  emailType: EmailType;
  startIndex: number;
  endIndex: number;
}

export interface QueueMetrics {
  totalJobs: number;
  activeJobs: number;
  waitingJobs: number;
  completedJobs: number;
  failedJobs: number;
  throughputPerSecond: number;
}

// Email classification helpers
export function classifyEmailType(campaignId?: string, metadata?: Record<string, any>): EmailType {
  if (metadata?.isTransactional || !campaignId) {
    return 'transactional';
  }
  if (metadata?.isSystem) {
    return 'system';
  }
  return 'marketing';
}

export function getEmailPriority(emailType: EmailType, metadata?: Record<string, any>): EmailPriority {
  if (emailType === 'transactional') return 'high';
  if (emailType === 'system') return 'low';
  if (metadata?.isUrgent) return 'high';
  return 'standard';
}

// Queue naming conventions
export function getQueueName(emailType: EmailType, region: string = 'us-east-1'): string {
  return `${region}-${emailType}`;
}

export function getBatchQueueName(emailType: EmailType, region: string = 'us-east-1'): string {
  return `${region}-${emailType}-batch`;
}

export function getDlqQueueName(emailType: EmailType, region: string = 'us-east-1'): string {
  return `${region}-${emailType}-dlq`;
}