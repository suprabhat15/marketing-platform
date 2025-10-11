import { CreditService } from './credit-service';
import { prisma } from './prisma';
import { EventType } from '@prisma/client';

export class EmailService {
  // Pre-flight check before sending campaign
  static async checkCreditsBeforeSending(
    userId: string,
    recipientCount: number
  ): Promise<{ canSend: boolean; creditsRequired: number; creditsAvailable: number }> {
    const balance = await CreditService.getUserCreditBalance(userId);
    
    return {
      canSend: balance.remainingCredits >= recipientCount,
      creditsRequired: recipientCount,
      creditsAvailable: balance.remainingCredits,
    };
  }

  // Reserve credits before sending (to prevent concurrent sends from oversending)
  static async reserveCreditsForCampaign(
    userId: string,
    campaignId: string,
    recipientCount: number
  ): Promise<boolean> {
    try {
      // Check if user has enough credits
      const hasEnough = await CreditService.hasEnoughCredits(userId, recipientCount);
      if (!hasEnough) {
        return false;
      }

      // Deduct credits upfront for the entire campaign
      await CreditService.bulkDeductCredits(
        userId,
        'SENT',
        recipientCount,
        {
          campaign_id: campaignId,
          operation: 'campaign_send_reservation',
        }
      );

      return true;
    } catch (error) {
      console.error('Error reserving credits for campaign:', error);
      return false;
    }
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

      // Only deduct credits for BOUNCED events here (SENT credits already deducted during reservation)
      if (eventType === 'BOUNCED' && campaignId) {
        // Get userId from campaign
        const campaign = await prisma.campaign.findUnique({
          where: { id: campaignId },
          select: { userId: true },
        });

        if (campaign) {
          await CreditService.processEmailEvent(
            campaign.userId,
            eventType,
            {
              campaignId,
              subscriberId,
              metadata,
            }
          );
        }
      }
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
        console.warn(`No active subscription found for refund to user ${userId}`);
        return;
      }

      // Refund credits
      const newUsedCredits = Math.max(0, subscription.usedCredits - failedCount);
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

    const eventCounts = events.reduce((acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

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
      creditUtilization: subscription.totalCredits > 0 
        ? (subscription.usedCredits / subscription.totalCredits) * 100 
        : 0,
    };
  }
}