import type { EventType } from '@prisma/client';

// Credit deduction service for email events
// NOTE: Credit deduction for SENT events is now handled at BATCH level
// in batch-email-processor.ts using EMAIL_BATCH ledger entries.
// This service is kept for:
// 1. Balance checks (hasEnoughCredits, getUserCreditBalance)
// 2. Future non-batch credit deductions if needed
export class CreditService {
  // Process email event - SENT events NO LONGER deduct credits here
  // Credit deduction moved to batch-email-processor.ts (batch-level)
  static async processEmailEvent(
    userId: string,
    eventType: EventType,
    _eventData: {
      campaignId?: string;
      subscriberId?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    // SENT events: Credit deduction handled at batch level (EMAIL_BATCH)
    // This function now only logs for tracking purposes
    if (eventType === 'SENT') {
      console.log(
        `📧 SENT event received for user ${userId} - credits handled at batch level`
      );
      return;
    }

    // Other event types can be handled here if needed in future
    console.log(`📧 Event ${eventType} received for user ${userId}`);
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
