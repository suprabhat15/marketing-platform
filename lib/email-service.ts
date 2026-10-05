import { CreditService } from './credit-service';
import { prisma } from './prisma';
import type { EventType } from '@prisma/client';
import { checkCreditAvailability } from './polar/polar-meter.service';

export class EmailService {
  static async checkCreditsBeforeSending(
    userId: string,
    recipientCount: number
  ): Promise<{
    canSend: boolean;
    creditsRequired: number;
    creditsAvailable: number;
  }> {
    const check = await checkCreditAvailability(userId, recipientCount);
    return {
      canSend: check.hasEnoughCredits,
      creditsRequired: recipientCount,
      creditsAvailable: check.availableCredits,
    };
  }

  // Compatibility name: this is an availability recheck, not a reservation.
  // Atomic campaign reservations are a separate sending-flow change.
  static async reserveCreditsForCampaign(
    userId: string,
    campaignId: string,
    recipientCount: number
  ): Promise<boolean> {
    const check = await checkCreditAvailability(userId, recipientCount);
    if (!check.hasEnoughCredits) {
      console.log(
        `Insufficient credits for campaign ${campaignId}: need ${recipientCount}, have ${check.availableCredits}`
      );
    }
    return check.hasEnoughCredits;
  }

  // Record individual email events (for tracking, no additional credit deduction)
  static async recordEmailEvent(
    eventType: EventType,
    campaignId?: string,
    subscriberId?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      await prisma.event.create({
        data: {
          type: eventType,
          data: metadata || {},
          ...(campaignId && { campaignId }),
          ...(subscriberId && { subscriberId }),
        },
      });

      // Credit deduction is handled automatically by batch-email-processor for SENT events
      // BOUNCED events no longer deduct credits since they weren't successfully delivered
    } catch (error) {
      console.error('Error recording email event:', error);
      throw error;
    }
  }

  // Refund credits for failed sends
  static async refundCreditsForFailedSends(
    userId: string,
    failedCount: number,
    campaignId?: string
  ): Promise<void> {
    if (failedCount <= 0) return;

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
      });

      if (!subscription) {
        console.warn(
          `No active subscription found for refund to user ${userId}`
        );
        return;
      }

      // Refund credits
      const newUsedCredits = Math.max(
        0,
        subscription.usedCredits - failedCount
      );
      const newRemainingCredits = subscription.totalCredits - newUsedCredits;

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          usedCredits: newUsedCredits,
          remainingCredits: newRemainingCredits,
        },
      });

      console.log(
        `Refunded ${failedCount} credits for user ${userId}. ` +
          `Credits: ${newUsedCredits}/${subscription.totalCredits} (${newRemainingCredits} remaining)`
      );
    } catch (error) {
      console.error('Error refunding credits:', error);
      throw error;
    }
  }

  // Get detailed usage analytics
  static async getUserUsageStats(userId: string) {
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
      return null;
    }

    // Get event counts for this billing period
    const events = await prisma.event.findMany({
      where: {
        campaign: {
          userId,
        },
        createdAt: {
          gte: subscription.currentPeriodStart || new Date(),
          lte: subscription.currentPeriodEnd || new Date(),
        },
      },
      select: {
        type: true,
      },
    });

    const eventCounts = events.reduce(
      (acc, event) => {
        acc[event.type] = (acc[event.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return {
      subscription: {
        totalCredits: subscription.totalCredits,
        usedCredits: subscription.usedCredits,
        remainingCredits: subscription.remainingCredits,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
      },
      usage: {
        sent: eventCounts.SENT || 0,
        bounced: eventCounts.BOUNCED || 0,
        delivered: eventCounts.DELIVERED || 0,
        opened: eventCounts.OPENED || 0,
        clicked: eventCounts.CLICKED || 0,
        unsubscribed: eventCounts.UNSUBSCRIBED || 0,
        complained: eventCounts.COMPLAINED || 0,
      },
      creditUtilization:
        subscription.totalCredits > 0
          ? (subscription.usedCredits / subscription.totalCredits) * 100
          : 0,
    };
  }
}
