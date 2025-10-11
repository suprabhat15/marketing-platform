import { prisma } from './prisma';
import { ingestEvent } from './polar';
import { EventType } from '@prisma/client';

// Credit deduction service for email events
export class CreditService {
  // Events that consume credits
  private static CREDIT_CONSUMING_EVENTS: EventType[] = ['SENT', 'BOUNCED'];

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
    // Only process SENT and BOUNCED events
    if (!this.CREDIT_CONSUMING_EVENTS.includes(eventType)) {
      return;
    }

    try {
      // Get user's active subscription
      const subscription = await prisma.subscription.findFirst({
        where: {
          userId,
          status: 'ACTIVE',
        },
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          user: true,
        },
      });

      if (!subscription) {
        console.warn(`No active subscription found for user ${userId}`);
        return;
      }

      // Check if user has enough credits
      if (subscription.remainingCredits <= 0) {
        console.warn(`User ${userId} has no remaining credits`);
        return;
      }

      // Deduct 1 credit for the event
      const newUsedCredits = subscription.usedCredits + 1;
      const newRemainingCredits = subscription.totalCredits - newUsedCredits;

      // Update subscription in database
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          usedCredits: newUsedCredits,
          remainingCredits: newRemainingCredits,
        },
      });

      // Ingest event to Polar for usage tracking (if meter is configured)
      if (subscription.meterId) {
        await ingestEvent({
          name: 'credits',
          externalCustomerId: userId, // Use userId as external customer ID
          timestamp: new Date(),
          metadata: {
            route: "/api/metered-route",
            method: "GET",
            event_type: eventType,
            campaign_id: eventData.campaignId,
            subscriber_id: eventData.subscriberId,
            user_id: userId,
            subscription_id: subscription.id,
            credits_consumed: 1,
            ...eventData.metadata,
          },
        });
      }

      console.log(
        `Credit deducted for user ${userId}: ${eventType} event. ` +
        `Credits: ${newUsedCredits}/${subscription.totalCredits} (${newRemainingCredits} remaining)`
      );

    } catch (error) {
      console.error('Error processing email event for credit deduction:', error);
      throw error;
    }
  }

  // Get user's credit balance (optionally sync from Polar)
  static async getUserCreditBalance(userId: string, syncFromPolar: boolean = false) {
    if (syncFromPolar) {
      // Import here to avoid circular dependency
      const { getUserCreditBalance } = await import('./polar');
      return await getUserCreditBalance(userId, true);
    }

    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!subscription) {
      return {
        totalCredits: 0,
        usedCredits: 0,
        remainingCredits: 0,
        hasActiveSubscription: false,
      };
    }

    return {
      totalCredits: subscription.totalCredits,
      usedCredits: subscription.usedCredits,
      remainingCredits: subscription.remainingCredits,
      hasActiveSubscription: true,
      subscriptionId: subscription.id,
      polarSubscriptionId: subscription.polarSubscriptionId,
      meterId: subscription.meterId,
      meterName: subscription.meterName,
    };
  }

  // Check if user has enough credits for an operation
  static async hasEnoughCredits(userId: string, requiredCredits: number = 1): Promise<boolean> {
    const balance = await this.getUserCreditBalance(userId);
    return balance.remainingCredits >= requiredCredits;
  }

  // Bulk deduct credits for multiple events (e.g., campaign sending)
  static async bulkDeductCredits(
    userId: string,
    eventType: EventType,
    count: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!this.CREDIT_CONSUMING_EVENTS.includes(eventType)) {
      return;
    }

    try {
      const subscription = await prisma.subscription.findFirst({
        where: {
          userId,
          status: 'ACTIVE',
        },
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          user: true,
        },
      });

      if (!subscription) {
        throw new Error(`No active subscription found for user ${userId}`);
      }

      if (subscription.remainingCredits < count) {
        throw new Error(
          `Insufficient credits. Required: ${count}, Available: ${subscription.remainingCredits}`
        );
      }

      // Deduct credits
      const newUsedCredits = subscription.usedCredits + count;
      const newRemainingCredits = subscription.totalCredits - newUsedCredits;

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          usedCredits: newUsedCredits,
          remainingCredits: newRemainingCredits,
        },
      });

      // Ingest bulk event to Polar
      if (subscription.meterId) {
        await ingestEvent({
          name: 'credits',
          externalCustomerId: userId,
          timestamp: new Date(),
          metadata: {
            route: "/api/metered-route",
            method: "GET",
            event_type: eventType,
            credits_consumed: count,
            user_id: userId,
            subscription_id: subscription.id,
            ...metadata,
          },
        });
      }

      console.log(
        `Bulk credit deduction for user ${userId}: ${count} credits for ${eventType}. ` +
        `Credits: ${newUsedCredits}/${subscription.totalCredits} (${newRemainingCredits} remaining)`
      );

    } catch (error) {
      console.error('Error in bulk credit deduction:', error);
      throw error;
    }
  }
}