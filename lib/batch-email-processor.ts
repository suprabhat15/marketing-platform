import { redis } from './redis';
import { sendEmail } from './ses';
import { prisma } from './prisma';
import { globalRateLimiter } from './global-rate-limiter';
import { CampaignProgressTracker } from './campaign-progress';
import { broadcastEvent } from './event-broadcast';

export interface BatchEmailData {
  campaignId: string;
  batchNumber: number;
  totalBatches: number;
  subscriberIds: string[];
  templateHtml: string;
  subject: string;
  fromEmail: string;
  fromName: string;
  replyTo: string;
  startIndex: number;
  endIndex: number;
}

// Template variable replacement function
function replaceVariables(content: string, subscriber: any): string {
  let processedContent = content;
  
  const variables = {
    firstName: subscriber.firstName || subscriber.name?.split(' ')[0] || '',
    lastName: subscriber.lastName || subscriber.name?.split(' ').slice(1).join(' ') || '',
    email: subscriber.email || '',
    unsubscribeUrl: `${process.env.NEXT_PUBLIC_APP_URL}/unsubscribe?email=${encodeURIComponent(subscriber.email)}`,
  };
  
  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    processedContent = processedContent.replace(regex, String(value));
  });
  
  return processedContent;
}

export class BatchEmailProcessor {
  private readonly concurrency: number;
  private readonly batchDelayMs: number;

  constructor(concurrency: number = 5, batchDelayMs: number = 100) {
    this.concurrency = concurrency;
    this.batchDelayMs = batchDelayMs;
  }

  /**
   * Process a batch by streaming email sends with rate limiting
   */
  async processBatch(batchData: BatchEmailData): Promise<void> {
    const {
      campaignId,
      batchNumber,
      totalBatches,
      subscriberIds,
      templateHtml,
      subject,
      fromEmail,
      fromName,
      replyTo
    } = batchData;

    console.log(`📦 Processing batch ${batchNumber}/${totalBatches} for campaign ${campaignId} (${subscriberIds.length} emails)`);

    try {
      // Get subscriber details
      const subscribers = await prisma.subscriber.findMany({
        where: {
          id: { in: subscriberIds },
          status: 'ACTIVE'
        }
      });

      if (subscribers.length === 0) {
        console.log(`⚠️ No active subscribers found for batch ${batchNumber}`);
        await CampaignProgressTracker.completeBatch(campaignId, batchNumber);
        return;
      }

      // Create a semaphore for batch-level concurrency
      const semaphore = new Semaphore(this.concurrency);
      const emailPromises: Promise<void>[] = [];

      // Process subscribers with controlled concurrency
      for (const subscriber of subscribers) {
        const emailPromise = semaphore.acquire(async () => {
          await this.sendSingleEmail({
            campaignId,
            subscriber,
            templateHtml,
            subject,
            fromEmail,
            fromName,
            replyTo
          });
        });

        emailPromises.push(emailPromise);

        // Add small delay between initiating sends to avoid thundering herd
        if (this.batchDelayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, this.batchDelayMs));
        }
      }

      // Wait for all emails in this batch to complete
      await Promise.allSettled(emailPromises);

      // Mark batch as completed
      await CampaignProgressTracker.completeBatch(campaignId, batchNumber);
      
      console.log(`✅ Batch ${batchNumber}/${totalBatches} completed for campaign ${campaignId}`);

    } catch (error) {
      console.error(`❌ Error processing batch ${batchNumber} for campaign ${campaignId}:`, error);
      
      // Mark failed emails
      await CampaignProgressTracker.incrementFailed(campaignId, subscriberIds.length);
      throw error;
    }
  }

  /**
   * Send a single email with global rate limiting
   */
  private async sendSingleEmail({
    campaignId,
    subscriber,
    templateHtml,
    subject,
    fromEmail,
    fromName,
    replyTo
  }: {
    campaignId: string;
    subscriber: any;
    templateHtml: string;
    subject: string;
    fromEmail: string;
    fromName: string;
    replyTo: string;
  }): Promise<void> {
    const messageId = `${campaignId}-${subscriber.id}-${Date.now()}`;

    try {
      // Acquire rate limit permit
      const rateLimitResult = await globalRateLimiter.acquire();
      
      if (!rateLimitResult.allowed) {
        console.warn(`Rate limit exceeded for campaign ${campaignId}, email to ${subscriber.email}`);
        await CampaignProgressTracker.incrementFailed(campaignId, 1);
        return;
      }

      // Process template variables
      const personalizedHtml = replaceVariables(templateHtml, subscriber);
      const personalizedSubject = replaceVariables(subject, subscriber);

      // Send the email
      await sendEmail({
        to: [subscriber.email],
        subject: personalizedSubject,
        html: personalizedHtml,
        from: `${fromName} <${fromEmail}>`,
        replyTo,
        campaignId,
        messageId
      });

      console.log(`✓ Email sent to ${subscriber.email} for campaign ${campaignId} (messageId: ${messageId})`);

      // Apply pacing hint from rate limiter
      if (rateLimitResult.nextRequestDelay && rateLimitResult.nextRequestDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, rateLimitResult.nextRequestDelay));
      }

    } catch (error) {
      console.error(`❌ Failed to send email to ${subscriber.email} for campaign ${campaignId}:`, error);
      
      // Increment failed count
      await CampaignProgressTracker.incrementFailed(campaignId, 1);

      // Create failed event
      try {
        const failedEvent = await prisma.event.create({
          data: {
            type: 'BOUNCED',
            data: {
              email: subscriber.email,
              messageId,
              timestamp: new Date().toISOString(),
              error: error instanceof Error ? error.message : 'Unknown error',
            },
            subscriberId: subscriber.id,
            campaignId,
          },
          include: {
            subscriber: {
              select: {
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        });

        await broadcastEvent(campaignId, failedEvent);
      } catch (eventError) {
        console.error('Error creating failed event:', eventError);
      }

      throw error;
    }
  }
}

/**
 * Simple semaphore implementation for controlling concurrency
 */
class Semaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const tryAcquire = () => {
        if (this.permits > 0) {
          this.permits--;
          fn()
            .then(resolve)
            .catch(reject)
            .finally(() => {
              this.permits++;
              if (this.waitQueue.length > 0) {
                const next = this.waitQueue.shift();
                if (next) next();
              }
            });
        } else {
          this.waitQueue.push(tryAcquire);
        }
      };

      tryAcquire();
    });
  }
}

// Export a default instance
export const batchEmailProcessor = new BatchEmailProcessor();