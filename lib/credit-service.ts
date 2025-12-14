import type { EventType } from '@prisma/client';

// Credit deduction service for email events
export class CreditService {
  // Events that consume credits - Only SENT events should deduct credits
  // BOUNCED emails don't deduct credits since they weren't successfully delivered
  private static CREDIT_CONSUMING_EVENTS: EventType[] = ['SENT'];

  // Process email event and deduct credits if applicable
  static async processEmailEvent(
    userId: string,
    eventType: EventType,
    eventData: {
      campaignId?: string;
      subscriberId?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    // Only process SENT events for credit deduction
    if (!this.CREDIT_CONSUMING_EVENTS.includes(eventType)) {
      return;
    }
    // console.log(
    //   '------------------------------------------------ POLAR EVENTS INGESTION ---------------------------------------'
    // );
    try {
      // Use the unified credit tracking function from polar.ts
      const { trackEmailCreditUsage } = await import('./polar');

      // Create unique event ID for idempotency
      const eventId = `${eventData.campaignId || 'unknown'}-${eventData.subscriberId || 'unknown'}-${eventData.metadata?.messageId || Date.now()}`;

      const result = await trackEmailCreditUsage(userId, 1, eventId);

      console.log(
        `✅ Credit deducted for user ${userId}: ${eventType} event (${eventId}) - Remaining: ${result.remainingCredits}/${result.totalCredits}`
      );
    } catch (error) {
      console.error(
        'Error processing email event for credit deduction:',
        error
      );
      throw error;
    }
  }

  // Get user's credit balance - delegate to polar.ts unified function
  static async getUserCreditBalance(
    userId: string,
    syncFromPolar: boolean = false
  ) {
    // Always use the unified function from polar.ts to avoid duplication
    const { getUserCreditBalanceWithSync } = await import('./polar');
    return await getUserCreditBalanceWithSync(userId, {
      syncFromPolar,
      updateSubscriptionStatus: false,
    });
  }

  // Check if user has enough credits for an operation
  static async hasEnoughCredits(
    userId: string,
    requiredCredits: number = 1
  ): Promise<boolean> {
    const balance = await this.getUserCreditBalance(userId);
    return balance.remainingCredits >= requiredCredits;
  }
}
