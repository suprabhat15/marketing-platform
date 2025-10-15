import { CreditService } from './credit-service';
import { prisma } from './prisma';
import { EventType } from '@prisma/client';
import { trackEmailCreditUsage, checkCreditAvailability } from './polar';

export class EmailService {
  // Pre-flight check before sending campaign (enhanced with Polar integration)
  static async checkCreditsBeforeSending(
    userId: string,
    recipientCount: number
  ): Promise<{ canSend: boolean; creditsRequired: number; creditsAvailable: number }> {
    try {
      // Check Polar credit availability first
      const polarCheck = await checkCreditAvailability(userId, recipientCount);
      
      if (polarCheck.hasEnoughCredits) {
        return {
          canSend: true,
          creditsRequired: recipientCount,
          creditsAvailable: polarCheck.availableCredits,
        };
      }

      // Fallback to local credit service if Polar fails
      const balance = await CreditService.getUserCreditBalance(userId);
      
      return {
        canSend: balance.remainingCredits >= recipientCount,
        creditsRequired: recipientCount,
        creditsAvailable: balance.remainingCredits,
      };
    } catch (error) {
      console.error('Error checking credits before sending:', error);
      
      // Fallback to local credit service
      const balance = await CreditService.getUserCreditBalance(userId);
      
      return {
        canSend: balance.remainingCredits >= recipientCount,
        creditsRequired: recipientCount,
        creditsAvailable: balance.remainingCredits,
      };
    }
  }

  // Reserve credits before sending (enhanced with Polar tracking)
  static async reserveCreditsForCampaign(
    userId: string,
    campaignId: string,
    recipientCount: number
  ): Promise<boolean> {
    try {
      // Check if user has enough credits using Polar first
      const creditCheck = await checkCreditAvailability(userId, recipientCount);
      if (!creditCheck.hasEnoughCredits) {
        console.log(`Insufficient credits for campaign ${campaignId}: need ${recipientCount}, have ${creditCheck.availableCredits}`);
        return false;
      }

      // Track the credit usage with Polar
      try {
        await trackEmailCreditUsage(userId, recipientCount);
        console.log(`Reserved ${recipientCount} credits via Polar for campaign ${campaignId}`);
      } catch (polarError) {
        console.error('Polar tracking failed, falling back to local credit service:', polarError);
        
        // Fallback to local credit service
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
      }

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

  // Track individual email send with Polar (use this for single email sends)
  static async trackSingleEmailSend(userId: string, emailData?: Record<string, any>) {
    try {
      const result = await trackEmailCreditUsage(userId, 1);
      console.log(`Tracked single email send for user ${userId}. Remaining credits: ${result.remainingCredits}`);
      return result;
    } catch (error) {
      console.error('Error tracking single email send:', error);
      throw error;
    }
  }
}