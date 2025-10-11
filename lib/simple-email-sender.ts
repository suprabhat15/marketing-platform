import { prisma } from './prisma';
import { addCampaignToQueue } from './queue';

// Queue-based email sender class
export class SimpleEmailSender {

  /**
   * Send a campaign using queue system for scalability
   */
  async sendCampaign(campaignId: string, userId: string, options?: { batchSize?: number }): Promise<{
    success: boolean;
    jobId?: string;
    message: string;
    subscriberCount?: number;
  }> {
    console.log(`📧 Starting campaign ${campaignId}`);
    
    try {
      // Check credits first
      const creditCheck = await this.checkCredits(userId, campaignId);
      if (!creditCheck.canSend) {
        return {
          success: false,
          message: `Insufficient credits: need ${creditCheck.required}, have ${creditCheck.available}`
        };
      }

      // Reserve credits upfront
      await this.reserveCredits(userId, creditCheck.required);

      // Get campaign data to validate
      const campaign = await this.getCampaignData(campaignId);
      if (!campaign) {
        return { success: false, message: 'Campaign not found' };
      }

      const subscriberCount = campaign.list.subscribers.length;
      
      // Add campaign to queue for processing
      const job = await addCampaignToQueue(campaignId, userId, {
        batchSize: options?.batchSize || Math.min(100, Math.max(10, Math.ceil(subscriberCount / 10)))
      });

      console.log(`✅ Campaign ${campaignId} queued for processing (${subscriberCount} emails)`);
      
      return {
        success: true,
        jobId: job.id?.toString(),
        message: `Campaign queued for processing (${subscriberCount} emails)`,
        subscriberCount
      };

    } catch (error) {
      console.error(`❌ Campaign ${campaignId} error:`, error);
      
      return {
        success: false,
        message: `Campaign failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Get campaign status from queue system
   */
  async getCampaignStatus(campaignId: string) {
    // TODO: Implement queue status checking
    return { status: 'unknown', campaignId };
  }

  /**
   * Get queue system health and stats
   */
  async getQueueHealth() {
    // TODO: Implement queue health checking
    return { healthy: true, queueLength: 0 };
  }

  /**
   * Check if user has enough credits
   */
  private async checkCredits(userId: string, campaignId: string): Promise<{
    canSend: boolean;
    required: number;
    available: number;
  }> {
    // Get subscriber count
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        list: {
          include: {
            _count: {
              select: { subscribers: { where: { status: 'ACTIVE' } } }
            }
          }
        }
      }
    });

    const required = campaign?.list._count.subscribers || 0;

    // Get user credits
    const subscription = await prisma.subscription.findFirst({
      where: { userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' }
    });

    const available = subscription?.remainingCredits || 0;

    return {
      canSend: available >= required,
      required,
      available
    };
  }

  /**
   * Reserve credits upfront
   */
  private async reserveCredits(userId: string, count: number): Promise<void> {
    const subscription = await prisma.subscription.findFirst({
      where: { userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' }
    });

    if (!subscription) throw new Error('No active subscription');

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        usedCredits: subscription.usedCredits + count,
        remainingCredits: subscription.remainingCredits - count
      }
    });
  }

  /**
   * Refund credits for failed sends (utility method)
   */
  async refundCredits(userId: string, count: number): Promise<void> {
    const subscription = await prisma.subscription.findFirst({
      where: { userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' }
    });

    if (!subscription) return;

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        usedCredits: Math.max(0, subscription.usedCredits - count),
        remainingCredits: subscription.remainingCredits + count
      }
    });
  }

  /**
   * Get campaign data with subscribers
   */
  private async getCampaignData(campaignId: string) {
    return await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        template: true,
        list: {
          include: {
            subscribers: {
              where: { status: 'ACTIVE' }
            }
          }
        }
      }
    });
  }
}

// Export simple instance
export const simpleEmailSender = new SimpleEmailSender();