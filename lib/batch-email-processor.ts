import { redis } from './redis';
import { sendEmail } from './ses';
import { prisma } from './prisma';
import { globalRateLimiter } from './global-rate-limiter';
// import { CampaignProgressTracker } from './campaign-progress';
import { broadcastEvent } from './event-broadcast';
import { dlqQueue } from './queue';
import { ingestEvent } from './polar';

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
  userId?: string; // Add userId to track credit usage
}

// Ingest credit usage to Polar when email is sent
async function ingestCreditUsage(
  userId: string,
  campaignId: string,
  subscriberEmail: string
): Promise<void> {
  try {
    await ingestEvent({
      name: 'credits',
      externalCustomerId: userId,
      metadata: {
        campaignId,
        subscriberEmail,
        source: 'email_campaign',
        timestamp: new Date().toISOString(),
      },
    });
    console.log(
      `💰 Credit ingested for user ${userId} (campaign: ${campaignId}, email: ${subscriberEmail})`
    );
  } catch (error) {
    console.error(`❌ Failed to ingest credit for user ${userId}:`, error);
    // Don't throw error to avoid failing the email send
  }
}

// Template variable replacement function
export function replaceVariables(content: string, subscriber: any): string {
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

  constructor(concurrency: number = 5, batchDelayMs: number = 500) {
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
      replyTo,
      userId
    } = batchData;

    console.log(`📦 Processing batch ${batchNumber}/${totalBatches} for campaign ${campaignId} (${subscriberIds.length} emails)`);

    try {
      // Get userId from campaign if not provided
      let campaignUserId = userId;
      if (!campaignUserId) {
        const campaign = await prisma.campaign.findUnique({
          where: { id: campaignId },
          select: { userId: true },
        });
        campaignUserId = campaign?.userId;
      }

      // Get subscriber details
      const subscribers = await prisma.subscriber.findMany({
        where: {
          id: { in: subscriberIds },
          status: 'ACTIVE',
        },
      });

      // if (subscribers.length === 0) {
      //   console.log(`⚠️ No active subscribers found for batch ${batchNumber}`);
      //   await CampaignProgressTracker.completeBatch(campaignId, batchNumber);
      //   return;
      // }

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
            replyTo,
            userId: campaignUserId,
          });
        });

        emailPromises.push(emailPromise);

        // Add small delay between initiating sends to avoid thundering herd
        if (this.batchDelayMs > 0) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.batchDelayMs)
          );
        }
      }

      // Wait for all emails in this batch to complete
      await Promise.allSettled(emailPromises);

      // Mark batch as completed
      // await CampaignProgressTracker.completeBatch(campaignId, batchNumber);

      console.log(
        `✅ Batch ${batchNumber}/${totalBatches} completed for campaign ${campaignId}`
      );
    } catch (error) {
      console.error(`❌ Error processing batch ${batchNumber} for campaign ${campaignId}:`, error);
      
      // Mark failed emails
      // await CampaignProgressTracker.incrementFailed(campaignId, subscriberIds.length);
      throw error;
    }
  }

  /**
   * Send a single email with global rate limiting and retry mechanism
   */
  private async sendSingleEmail({
    campaignId,
    subscriber,
    templateHtml,
    subject,
    fromEmail,
    fromName,
    replyTo,
    userId
  }: {
    campaignId: string;
    subscriber: any;
    templateHtml: string;
    subject: string;
    fromEmail: string;
    fromName: string;
    replyTo: string;
    userId?: string;
  }): Promise<void> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const messageId = `${campaignId}-${subscriber.id}-${Date.now()}-attempt${attempt}`;

      try {
        // Acquire rate limit permit
        const rateLimitResult = await globalRateLimiter.acquire();

        if (!rateLimitResult.allowed) {
          if (attempt === maxRetries) {
            await this.handleFinalFailure(
              campaignId,
              subscriber,
              templateHtml,
              subject,
              fromEmail,
              fromName,
              replyTo,
              'Rate limit exceeded'
            );
            return;
          }

          const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise((resolve) => setTimeout(resolve, backoffDelay));
          continue;
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
          messageId,
        });

        // Create SENT event in database
        try {
          const sentEvent = await prisma.event.create({
            data: {
              type: 'SENT',
              data: {
                email: subscriber.email,
                messageId,
                timestamp: new Date().toISOString(),
                subject: personalizedSubject,
                fromEmail,
                fromName,
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

          await broadcastEvent(campaignId, sentEvent);
        } catch (eventError) {
          console.error('Error creating SENT event:', eventError);
        }

        // Increment sent count
        // await CampaignProgressTracker.incrementSent(campaignId, 1);

        // Ingest credit usage to Polar
        if (userId) {
          await ingestCreditUsage(userId, campaignId, subscriber.email);
        } else {
          console.warn(
            `⚠️ No userId available for credit ingestion (campaign: ${campaignId}, subscriber: ${subscriber.email})`
          );
        }

        // Apply pacing hint from rate limiter
        if (
          rateLimitResult.nextRequestDelay &&
          rateLimitResult.nextRequestDelay > 0
        ) {
          await new Promise((resolve) =>
            setTimeout(resolve, rateLimitResult.nextRequestDelay)
          );
        }

        return; // Success
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt === maxRetries) {
          await this.handleFinalFailure(campaignId, subscriber, templateHtml, subject, fromEmail, fromName, replyTo, lastError.message);
          return;
        }
        
        // Exponential backoff with error-specific adjustments
        let backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        if (lastError.message.includes('rate limit') || lastError.message.includes('throttle')) {
          backoffDelay = Math.min(2000 * Math.pow(2, attempt - 1), 20000);
        } else if (lastError.message.includes('network') || lastError.message.includes('timeout')) {
          backoffDelay = Math.min(3000 * Math.pow(2, attempt - 1), 30000);
        }
        
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }
  }

  /**
   * Handle final failure after all retries exhausted
   */
  private async handleFinalFailure(
    campaignId: string,
    subscriber: any,
    templateHtml: string,
    subject: string,
    fromEmail: string,
    fromName: string,
    replyTo: string,
    errorMessage: string
  ): Promise<void> {
    const maxRetries = 3;

    // Store in Redis for DLQ tracking
    await this.storeDlqEmailInRedis(campaignId, {
      subscriberId: subscriber.id,
      email: subscriber.email,
      templateHtml,
      subject,
      fromEmail,
      fromName,
      replyTo,
      error: errorMessage,
      attempts: maxRetries,
      failedAt: new Date().toISOString(),
      status: 'failed'
    });

    // Add to DLQ for potential replay
    try {
      await dlqQueue.add('failed-email', {
        campaignId,
        subscriberId: subscriber.id,
        email: subscriber.email,
        templateHtml,
        subject,
        fromEmail,
        fromName,
        replyTo,
        error: errorMessage,
        attempts: maxRetries,
        failedAt: new Date().toISOString()
      }, {
        attempts: 3,
        removeOnComplete: true
      });
    } catch (dqErr) {
      console.error('Failed to push to DLQ:', dqErr);
    }

    // Update campaign progress
    // await CampaignProgressTracker.incrementFailed(campaignId, 1);

    // Create failed event
    try {
      const failedEvent = await prisma.event.create({
        data: {
          type: 'BOUNCED',
          data: {
            email: subscriber.email,
            messageId: `${campaignId}-${subscriber.id}-final-failure`,
            timestamp: new Date().toISOString(),
            error: errorMessage,
            retryAttempts: maxRetries,
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
  }

  /**
   * Store DLQ email information in Redis for tracking
   */
  private async storeDlqEmailInRedis(campaignId: string, emailData: any): Promise<void> {
    try {
      const dlqKey = `dlq:${campaignId}`;
      const emailKey = `${emailData.subscriberId}:${emailData.email}`;
      
      await redis.hset(dlqKey, emailKey, JSON.stringify({
        ...emailData,
        updatedAt: new Date().toISOString()
      }));

      // Set expiration for 30 days
      await redis.expire(dlqKey, 30 * 24 * 60 * 60);
    } catch (error) {
      console.error('Error storing DLQ email in Redis:', error);
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