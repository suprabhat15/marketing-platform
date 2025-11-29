import { redis } from './redis';
import { sendEmail } from './ses';
import { prisma } from './prisma';
import { enhancedRateLimiter } from './global-rate-limiter';
import { emailErrorClassifier } from './error-classifier';
import { dlqQueue } from './queue';

export interface BatchEmailData {
  campaignId: string;
  batchNumber: number;
  totalBatches: number;
  subscriberIds: string[];
  templateId?: string; // Reference to template instead of full HTML
  templateHtml?: string; // Fallback for inline content
  subject: string;
  fromEmail: string;
  fromName: string;
  replyTo: string;
  startIndex: number;
  endIndex: number;
  userId?: string; // Add userId to track credit usage
}

// Note: Credit ingestion and SENT event processing is handled by SES webhooks
// via CreditService.processEmailEvent() to maintain single point of processing

// Template variable replacement function
export function replaceVariables(content: string, subscriber: any): string {
  let processedContent = content;

  const variables = {
    firstName: subscriber.firstName || subscriber.name?.split(' ')[0] || '',
    lastName:
      subscriber.lastName ||
      subscriber.name?.split(' ').slice(1).join(' ') ||
      '',
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
  private readonly maxRetries: number = 3; // Add explicit max retries
  private readonly timeoutMs: number = 30000; // 30 second timeout per email

  constructor(concurrency: number = 5, batchDelayMs: number = 500) {
    this.concurrency = concurrency;
    this.batchDelayMs = batchDelayMs;
  }

  /**
   * Load template content from database using template ID
   */
  private async loadTemplate(templateId: string): Promise<string> {
    try {
      const template = await prisma.template.findUnique({
        where: { id: templateId },
        select: { content: true, html: true },
      });

      if (!template) {
        throw new Error(`Template ${templateId} not found`);
      }

      return template.content || template.html || '';
    } catch (error) {
      console.error(`Error loading template ${templateId}:`, error);
      throw error;
    }
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
      templateId,
      templateHtml,
      subject,
      fromEmail,
      fromName,
      replyTo,
      userId,
    } = batchData;

    console.log(
      `📦 Processing batch ${batchNumber}/${totalBatches} for campaign ${campaignId} (${subscriberIds.length} emails)`
    );

    try {
      // Validate campaign exists before processing
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { id: true, userId: true },
      });

      if (!campaign) {
        throw new Error(`Campaign ${campaignId} not found`);
      }

      // Get userId from campaign if not provided
      const campaignUserId = userId || campaign.userId;

      if (!campaignUserId) {
        throw new Error(`Campaign ${campaignId} has no associated userId`);
      }

      // Check if user still has credits before processing this batch
      try {
        const { CreditService } = await import('./credit-service');
        const hasCredits = await CreditService.hasEnoughCredits(
          campaignUserId,
          subscriberIds.length
        );

        if (!hasCredits) {
          console.error(
            `❌ Insufficient credits for batch ${batchNumber} of campaign ${campaignId}`
          );
          const balance =
            await CreditService.getUserCreditBalance(campaignUserId);
          throw new Error(
            `Insufficient credits for batch processing: need ${subscriberIds.length}, have ${balance.remainingCredits}`
          );
        }

        console.log(
          `✅ Credit check passed for batch ${batchNumber} of campaign ${campaignId}`
        );
      } catch (creditError) {
        // Re-throw credit errors to prevent sending without proper tracking
        throw creditError;
      }

      // Load template content if using template reference pattern
      let resolvedTemplateHtml = templateHtml;
      if (!resolvedTemplateHtml && templateId) {
        resolvedTemplateHtml = await this.loadTemplate(templateId);
      }

      if (!resolvedTemplateHtml) {
        throw new Error(
          `No template content available for campaign ${campaignId}`
        );
      }

      // Get subscriber details
      const subscribers = await prisma.subscriber.findMany({
        where: {
          id: { in: subscriberIds },
          status: 'ACTIVE',
        },
      });

      console.log(
        `📊 Retrieved ${subscribers.length} active subscribers for batch ${batchNumber} of campaign ${campaignId}`
      );

      // if (subscribers.length === 0) {
      //   console.log(`⚠️ No active subscribers found for batch ${batchNumber}`);
      //   await CampaignProgressTracker.completeBatch(campaignId, batchNumber);
      //   return;
      // }

      // Process subscribers in memory-efficient chunks to avoid Promise array buildup
      const CHUNK_SIZE = 10; // Process 10 emails at a time to limit memory usage
      const semaphore = new Semaphore(this.concurrency);

      for (let i = 0; i < subscribers.length; i += CHUNK_SIZE) {
        const chunk = subscribers.slice(i, i + CHUNK_SIZE);
        const chunkPromises: Promise<void>[] = [];

        // Process this chunk of subscribers
        for (const subscriber of chunk) {
          const emailPromise = semaphore.acquire(async () => {
            await this.sendSingleEmail({
              campaignId,
              subscriber,
              templateHtml: resolvedTemplateHtml,
              subject,
              fromEmail,
              fromName,
              replyTo,
              userId: campaignUserId,
            });
          });

          chunkPromises.push(emailPromise);

          // Add small delay between initiating sends to avoid thundering herd
          if (this.batchDelayMs > 0) {
            await new Promise((resolve) =>
              setTimeout(resolve, this.batchDelayMs)
            );
          }
        }

        // Wait for this chunk to complete before starting the next
        await Promise.allSettled(chunkPromises);

        // Small delay between chunks to allow GC and reduce memory pressure
        if (i + CHUNK_SIZE < subscribers.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      // Mark batch as completed
      // await CampaignProgressTracker.completeBatch(campaignId, batchNumber);

      console.log(
        `✅ Batch ${batchNumber}/${totalBatches} completed for campaign ${campaignId}`
      );
    } catch (error) {
      console.error(
        `❌ Error processing batch ${batchNumber} for campaign ${campaignId}:`,
        error
      );

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
    userId,
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
    // Atomically check and mark as in-progress to prevent duplicates
    const sentKey = `sent:${campaignId}:${subscriber.id}`;
    const lockKey = `lock:${sentKey}`;
    const lockAcquired = await redis.set(lockKey, '1', 'EX', 300, 'NX'); // 5 min lock

    if (!lockAcquired) {
      console.log(
        `📧 Email send already in progress or sent for ${subscriber.email}, skipping`
      );
      return;
    }

    const alreadySent = await redis.get(sentKey);

    if (alreadySent) {
      console.log(
        `📧 Email already sent to ${subscriber.email} for campaign ${campaignId}, skipping`
      );
      await redis.del(lockKey);
      return;
    }
    
    console.log(
      `🚀 Starting email send process for ${subscriber.email} in campaign ${campaignId}`
    );
    
    let lastError: Error | null = null;
    // Use consistent messageId across all attempts
    const baseMessageId = `${campaignId}-${subscriber.id}-${Date.now()}`;
  
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      const messageId = `${baseMessageId}-attempt${attempt}`;

      try {
        // Add timeout wrapper for the entire email send process
        const emailTimeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error('Email send timeout')),
            this.timeoutMs
          );
        });

        const emailSendPromise = this.performEmailSend({
          campaignId,
          subscriber,
          templateHtml,
          subject,
          fromEmail,
          fromName,
          replyTo,
          userId,
          messageId,
        });

        // Race between email send and timeout
        await Promise.race([emailSendPromise, emailTimeoutPromise]);

        return; // Success
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Handle timeout specifically
        if (lastError.message.includes('timeout')) {
          console.error(
            `⏰ Email send timeout for ${subscriber.email} (attempt ${attempt}/${this.maxRetries})`
          );
          if (attempt === this.maxRetries) {
            await this.handleFinalFailure(
              campaignId,
              subscriber,
              templateHtml,
              subject,
              fromEmail,
              fromName,
              replyTo,
              'Email send timeout'
            );
            return;
          }
          // Shorter timeout backoff
          await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        }

        if (attempt === this.maxRetries) {
          await this.handleFinalFailure(
            campaignId,
            subscriber,
            templateHtml,
            subject,
            fromEmail,
            fromName,
            replyTo,
            lastError.message
          );
          return;
        }

        // Exponential backoff with error-specific adjustments
        let backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        if (
          lastError.message.includes('rate limit') ||
          lastError.message.includes('throttle')
        ) {
          backoffDelay = Math.min(2000 * Math.pow(2, attempt - 1), 20000);
        } else if (
          lastError.message.includes('network') ||
          lastError.message.includes('timeout')
        ) {
          backoffDelay = Math.min(3000 * Math.pow(2, attempt - 1), 30000);
        }

        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
      }
    }
  }

  /**
   * Perform the actual email send with rate limiting
   */
  private async performEmailSend({
    campaignId,
    subscriber,
    templateHtml,
    subject,
    fromEmail,
    fromName,
    replyTo,
    userId,
    messageId,
  }: {
    campaignId: string;
    subscriber: any;
    templateHtml: string;
    subject: string;
    fromEmail: string;
    fromName: string;
    replyTo: string;
    userId?: string;
    messageId: string;
  }): Promise<void> {
    // Acquire rate limit permit with timeout
    const rateLimitTimeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Rate limit timeout')), 10000); // 10 second timeout for rate limiting
    });

    const rateLimitPromise = enhancedRateLimiter.acquire('marketing');
    const rateLimitResult = await Promise.race([
      rateLimitPromise,
      rateLimitTimeout,
    ]);

    if (!rateLimitResult.allowed) {
      throw new Error('Rate limit exceeded');
    }

    // Process template variables
    const personalizedHtml = replaceVariables(templateHtml, subscriber);
    const personalizedSubject = replaceVariables(subject, subscriber);

    // Send the email with timeout
    const sendEmailTimeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Send email timeout')), 20000); // 20 second timeout for SES
    });

    const sendEmailPromise = sendEmail({
      to: [subscriber.email],
      subject: personalizedSubject,
      html: personalizedHtml,
      from: `${fromName} <${fromEmail}>`,
      replyTo,
      campaignId,
      messageId,
    });

    const sesResult = await Promise.race([sendEmailPromise, sendEmailTimeout]);

    if (!sesResult.success) {
      const error = sesResult.error || new Error('Unknown SES send failure');
      // Normalize error to expected format
      const normalizedError = {
        code: (error as any).code || (error as any).name || 'Unknown',
        message: error.message || 'Unknown SES send failure',
      };
      // Use enhanced error classification
      const errorHandlingResult = await emailErrorClassifier.handleEmailError(
        normalizedError,
        subscriber.email,
        campaignId,
        subscriber.id
      );

      console.error(`❌ Email failed for ${subscriber.email}:`, {
        error: errorHandlingResult.classified.message,
        errorType: errorHandlingResult.classified.type,
        shouldRetry: errorHandlingResult.shouldRetry,
        suppressionAdded: errorHandlingResult.suppressionAdded,
      });

      // Only throw if it's a retryable error
      if (
        errorHandlingResult.shouldRetry &&
        !errorHandlingResult.suppressionAdded
      ) {
        throw new Error(error.message || 'SES send failed - retryable');
      } else {
        // Don't retry permanent bounces or suppressed emails
        return; // Success path - error was properly classified
      }
    }

    // Mark email as successfully sent to prevent duplicates
    const sentKey = `sent:${campaignId}:${subscriber.id}`;
    await redis.setex(sentKey, 2 * 24 * 60 * 60, messageId); // 2 days expiration

    // SENT events are created by SES webhooks, not here to avoid duplicates
    console.log(
      `📧 Email sent successfully for ${subscriber.email}, messageId: ${messageId}`
    );

    // Queue SENT event for Polar ingestion to avoid rate limits and ensure reliability
    try {
      // Prefer provided userId, else fetch from campaign
      let resolvedUserId = userId;
      if (!resolvedUserId) {
        const campaign = await prisma.campaign.findUnique({
          where: { id: campaignId },
          select: { userId: true },
        });
        resolvedUserId = campaign?.userId;
      }

      if (resolvedUserId) {
        // Use SQS for reliable Polar event processing
        // This should not fail email sending if SQS is unavailable
        try {
          const { sendPolarEventToSQS } = await import('./sqs-service');

          const eventId = `${messageId}`;

          await sendPolarEventToSQS({
            userId: resolvedUserId,
            eventType: 'SENT',
            eventData: {
              campaignId,
              subscriberId: subscriber.id,
              metadata: {
                messageId,
                recipientEmail: subscriber.email,
                timestamp: new Date().toISOString(),
              },
            },
            timestamp: new Date().toISOString(),
            eventId,
          });
        } catch (sqsError) {
          console.warn(
            '⚠️ Failed to send event to SQS, but email was sent successfully:',
            sqsError
          );
          // Don't throw - email sending should succeed even if SQS fails
          // Lambda will miss this event, but it's better than failing email delivery
        }
        // console.log(
        //   `🔵 SENT event queued for Polar ingestion for user ${resolvedUserId} - campaign: ${campaignId}`
        // );
      } else {
        console.warn(
          `⚠️ Missing userId for campaign ${campaignId}; skipping Polar SENT ingestion`
        );
      }
    } catch (queueError) {
      console.error(
        '❌ Error queuing SENT event for Polar ingestion:',
        queueError
      );
      // Log error but don't fail the send flow - the email was sent successfully
      // The queue system will ensure eventual processing or proper error handling
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

    // Classify the error before storing
    const mockError = { code: 'FinalFailure', message: errorMessage };
    const errorHandlingResult = await emailErrorClassifier.handleEmailError(
      mockError,
      subscriber.email,
      campaignId,
      subscriber.id
    );
    
    console.log(`🔍 Final failure classification for ${subscriber.email}:`, {
      errorType: errorHandlingResult.classified.type,
      shouldSuppress: errorHandlingResult.classified.shouldSuppress,
      suppressionAdded: errorHandlingResult.suppressionAdded
    });

    // Store in Redis for DLQ tracking with classification
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
      status: 'failed',
      errorType: errorHandlingResult.classified.type,
      isPermanentBounce: errorHandlingResult.classified.shouldSuppress,
    });

    // Only add to DLQ if it's retryable
    if (errorHandlingResult.shouldRetry && !errorHandlingResult.suppressionAdded) {
      try {
        await dlqQueue.add(
          'failed-email',
          {
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
            failedAt: new Date().toISOString(),
            errorType: errorHandlingResult.classified.type,
          },
          {
            attempts: 1, // Reduced for DLQ
            removeOnComplete: true,
          }
        );
      } catch (dqErr) {
        console.error('Failed to push to DLQ:', dqErr);
      }
    }

    // Only create BOUNCED event if it's actually a bounce (not just a retry failure)
    if (errorHandlingResult.classified.shouldSuppress) {
      try {
        const bouncedEvent = await prisma.event.create({
          data: {
            type: 'BOUNCED',
            data: {
              email: subscriber.email,
              messageId: `${campaignId}-${subscriber.id}-permanent-bounce`,
              timestamp: new Date().toISOString(),
              error: errorMessage,
              errorType: errorHandlingResult.classified.type,
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

        // await broadcastEvent(campaignId, bouncedEvent); // Removed - using aggregated stats
      } catch (eventError) {
        console.error('Error creating bounced event:', eventError);
      }
    }
  }

  /**
   * Store DLQ email information in Redis for tracking
   */
  private async storeDlqEmailInRedis(
    campaignId: string,
    emailData: any
  ): Promise<void> {
    try {
      const dlqKey = `dlq:${campaignId}`;
      const emailKey = `${emailData.subscriberId}:${emailData.email}`;

      await redis.hset(
        dlqKey,
        emailKey,
        JSON.stringify({
          ...emailData,
          updatedAt: new Date().toISOString(),
        })
      );

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