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
    console.log(
      '------------------------------------------------ POLAR EVENTS INGESTINO ---------------------------------------'
    );
    try {
      // Get user's active subscription or canceled subscription with remaining credits
      const subscription = await prisma.subscription.findFirst({
        where: {
          userId,
          OR: [
            { status: 'ACTIVE' },
            {
              status: 'CANCELED',
              remainingCredits: { gt: 0 }, // Allow canceled subscriptions with remaining credits
            },
          ],
        },
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          user: true,
        },
      });

      if (!subscription) {
        console.warn(
          `-----------No active subscription or canceled subscription with credits found for user ${userId}-----------`
        );
        throw 'No active subscription';
      }

      // Check if user has enough credits
      if (subscription.remainingCredits <= 0) {
        console.warn(
          `-----------User ${userId} has no remaining credits-----------`
        );
        throw 'No remaining credits';
      }

      // Deduct 1 credit for the event
      const newUsedCredits = subscription.usedCredits + 1;
      const newRemainingCredits = subscription.totalCredits - newUsedCredits;

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
          name: 'SENT',
          externalCustomerId: userId, // Use userId as external customer ID
          metadata: {
            source: 'process email events',
            event_type: eventType,
            campaign_id: eventData.campaignId,
            subscriber_id: eventData.subscriberId,
            user_id: userId,
            subscription_id: subscription.id,
            ...eventData.metadata,
          },
        });
      }

      console.log(
        `Credit deducted for user ${userId}: ${eventType} event. ` +
          `Credits: ${newUsedCredits}/${subscription.totalCredits} (${newRemainingCredits} remaining)`
      );
    } catch (error) {
      console.error(
        'Error processing email event for credit deduction:',
        error
      );
      throw error;
    }
  }

  // Get user's credit balance (optionally sync from Polar)
  static async getUserCreditBalance(
    userId: string,
    syncFromPolar: boolean = false
  ) {
    if (syncFromPolar) {
      // Import here to avoid circular dependency
      const { getUserCreditBalanceWithSync } = await import('./polar');
      return await getUserCreditBalanceWithSync(userId, {
        syncFromPolar: true,
        updateSubscriptionStatus: false,
      });
    }

    // Keep existing local database logic unchanged
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        OR: [
          { status: 'ACTIVE' },
          {
            status: 'CANCELED',
            remainingCredits: { gt: 0 }, // Allow canceled subscriptions with remaining credits
          },
        ],
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
  static async hasEnoughCredits(
    userId: string,
    requiredCredits: number = 1
  ): Promise<boolean> {
    const balance = await this.getUserCreditBalance(userId);
    return balance.remainingCredits >= requiredCredits;
  }

  // Bulk deduct credits for multiple events (e.g., campaign sending)
  // static async bulkDeductCredits(
  //   // TODO: On sending campaign, this func shud be executed but we're using single email sending pattern
  //   userId: string,
  //   eventType: EventType,
  //   count: number,
  //   metadata?: Record<string, any>
  // ): Promise<void> {
  //   if (!this.CREDIT_CONSUMING_EVENTS.includes(eventType)) {
  //     return;
  //   }

  //   try {
  //     const subscription = await prisma.subscription.findFirst({
  //       where: {
  //         userId,
  //         OR: [
  //           { status: 'ACTIVE' },
  //           {
  //             status: 'CANCELED',
  //             remainingCredits: { gt: 0 }, // Allow canceled subscriptions with remaining credits
  //           },
  //         ],
  //       },
  //       orderBy: {
  //         createdAt: 'desc',
  //       },
  //       include: {
  //         user: true,
  //       },
  //     });

  //     if (!subscription) {
  //       throw new Error(
  //         `No active subscription or canceled subscription with credits found for user ${userId}`
  //       );
  //     }

  //     if (subscription.remainingCredits < count) {
  //       throw new Error(
  //         `Insufficient credits. Required: ${count}, Available: ${subscription.remainingCredits}`
  //       );
  //     }

  //     // Deduct credits
  //     const newUsedCredits = subscription.usedCredits + count;
  //     const newRemainingCredits = subscription.totalCredits - newUsedCredits;

  //     await prisma.subscription.update({
  //       where: { id: subscription.id },
  //       data: {
  //         usedCredits: newUsedCredits,
  //         remainingCredits: newRemainingCredits,
  //       },
  //     });

  //     // Ingest bulk event to Polar
  //     if (subscription.meterId) {
  //       await ingestEvent({
  //         name: 'SENT',
  //         externalCustomerId: userId,
  //         timestamp: new Date(),
  //         metadata: {
  //           source: 'bulk deduct credit',
  //           event_type: eventType,
  //           credits_consumed: count,
  //           user_id: userId,
  //           subscription_id: subscription.id,
  //           ...metadata,
  //         },
  //       });
  //     }

  //     console.log(
  //       `Bulk credit deduction for user ${userId}: ${count} credits for ${eventType}. ` +
  //         `Credits: ${newUsedCredits}/${subscription.totalCredits} (${newRemainingCredits} remaining)`
  //     );
  //   } catch (error) {
  //     console.error('Error in bulk credit deduction:', error);
  //     throw error;
  //   }
  // }
}