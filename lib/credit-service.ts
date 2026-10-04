import type { EventType } from '@prisma/client';
import { readCreditBalance } from './credit-balance.service';

// Credit deduction service for email events
// Campaign sends reserve local credits before SES and confirm them on acceptance.
// The delivery record tracks confirmation and idempotent Polar usage retries.
// This service is kept for:
// 1. Balance checks (hasEnoughCredits, getUserCreditBalance)
// 2. Future non-batch credit deductions if needed
export class CreditService {
  // This legacy queue consumer does not allocate or consume credits.
  static async processEmailEvent(
    userId: string,
    eventType: EventType,
    _eventData: {
      campaignId?: string;
      subscriberId?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    if (eventType === 'SENT') {
      console.log(
        `📧 SENT event received for user ${userId} - credit settlement handled by the send transaction`
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
    if (!syncFromPolar) return readCreditBalance(userId);
    const { getUserCreditBalanceWithSync } =
      await import('./polar/polar-meter.service');
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
