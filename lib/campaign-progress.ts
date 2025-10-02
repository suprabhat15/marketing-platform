import { redis } from './redis';

export interface CampaignProgress {
  campaignId: string;
  totalSubscribers: number;
  sentCount: number;
  bouncedCount: number;
  failedCount: number;
  processedCount: number; // sent + bounced + failed
  batchesTotal: number;
  batchesCompleted: number;
  startedAt: string;
  completedAt?: string;
  status: 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED';
}

export class CampaignProgressTracker {
  private static getKey(campaignId: string): string {
    return `campaign:progress:${campaignId}`;
  }

  private static getBatchKey(campaignId: string): string {
    return `campaign:batches:${campaignId}`;
  }

  /**
   * Initialize progress tracking for a campaign
   */
  static async initializeProgress(
    campaignId: string,
    totalSubscribers: number,
    batchesTotal: number
  ): Promise<void> {
    const key = this.getKey(campaignId);
    const batchKey = this.getBatchKey(campaignId);
    
    const progress: Omit<CampaignProgress, 'processedCount'> = {
      campaignId,
      totalSubscribers,
      sentCount: 0,
      bouncedCount: 0,
      failedCount: 0,
      batchesTotal,
      batchesCompleted: 0,
      startedAt: new Date().toISOString(),
      status: 'SENDING'
    };

    await Promise.all([
      redis.hmset(key, progress),
      redis.expire(key, 86400 * 7), // 7 days
      redis.del(batchKey), // Clean up any existing batch tracking
      redis.expire(batchKey, 86400 * 7)
    ]);
  }

  /**
   * Mark a batch as completed
   */
  static async completeBatch(campaignId: string, batchNumber: number): Promise<void> {
    const key = this.getKey(campaignId);
    const batchKey = this.getBatchKey(campaignId);
    
    await Promise.all([
      redis.sadd(batchKey, batchNumber.toString()),
      redis.hincrby(key, 'batchesCompleted', 1)
    ]);
  }

  /**
   * Increment sent count (called by SES webhook on successful send)
   */
  static async incrementSent(campaignId: string, count: number = 1): Promise<number> {
    const key = this.getKey(campaignId);
    return await redis.hincrby(key, 'sentCount', count);
  }

  /**
   * Increment bounced count (called by SES webhook on bounce)
   */
  static async incrementBounced(campaignId: string, count: number = 1): Promise<number> {
    const key = this.getKey(campaignId);
    return await redis.hincrby(key, 'bouncedCount', count);
  }

  /**
   * Increment failed count (called when email send fails)
   */
  static async incrementFailed(campaignId: string, count: number = 1): Promise<number> {
    const key = this.getKey(campaignId);
    return await redis.hincrby(key, 'failedCount', count);
  }

  /**
   * Get current progress for a campaign
   */
  static async getProgress(campaignId: string): Promise<CampaignProgress | null> {
    const key = this.getKey(campaignId);
    
    try {
      const data = await redis.hgetall(key);
      
      if (!data || !data.campaignId) {
        return null;
      }

      const progress: CampaignProgress = {
        campaignId: data.campaignId,
        totalSubscribers: parseInt(data.totalSubscribers) || 0,
        sentCount: parseInt(data.sentCount) || 0,
        bouncedCount: parseInt(data.bouncedCount) || 0,
        failedCount: parseInt(data.failedCount) || 0,
        processedCount: 0, // will be calculated below
        batchesTotal: parseInt(data.batchesTotal) || 0,
        batchesCompleted: parseInt(data.batchesCompleted) || 0,
        startedAt: data.startedAt,
        completedAt: data.completedAt,
        status: data.status as CampaignProgress['status']
      };

      progress.processedCount = progress.sentCount + progress.bouncedCount + progress.failedCount;

      return progress;
    } catch (error) {
      console.error(`Error getting progress for campaign ${campaignId}:`, error);
      return null;
    }
  }

  /**
   * Check if campaign is complete and mark as SENT if so
   */
  static async checkAndMarkComplete(campaignId: string): Promise<boolean> {
    const progress = await this.getProgress(campaignId);
    
    if (!progress || progress.status === 'SENT' || progress.status === 'FAILED') {
      return false;
    }

    // Check if all emails have been processed (sent + bounced + failed >= total)
    const isComplete = progress.processedCount >= progress.totalSubscribers;
    
    if (isComplete) {
      const key = this.getKey(campaignId);
      await Promise.all([
        redis.hset(key, 'status', 'SENT'),
        redis.hset(key, 'completedAt', new Date().toISOString())
      ]);
      
      console.log(`✅ Campaign ${campaignId} marked as complete: ${progress.sentCount} sent, ${progress.bouncedCount} bounced, ${progress.failedCount} failed`);
      return true;
    }

    return false;
  }

  /**
   * Mark campaign as failed
   */
  static async markFailed(campaignId: string, reason?: string): Promise<void> {
    const key = this.getKey(campaignId);
    const updates: Record<string, string> = {
      status: 'FAILED',
      completedAt: new Date().toISOString()
    };

    if (reason) {
      updates.failureReason = reason;
    }

    await redis.hmset(key, updates);
  }

  /**
   * Get progress for multiple campaigns
   */
  static async getMultipleProgress(campaignIds: string[]): Promise<Record<string, CampaignProgress | null>> {
    const results: Record<string, CampaignProgress | null> = {};
    
    await Promise.all(
      campaignIds.map(async (campaignId) => {
        results[campaignId] = await this.getProgress(campaignId);
      })
    );

    return results;
  }

  /**
   * Clean up progress data for a campaign
   */
  static async cleanup(campaignId: string): Promise<void> {
    const key = this.getKey(campaignId);
    const batchKey = this.getBatchKey(campaignId);
    
    await Promise.all([
      redis.del(key),
      redis.del(batchKey)
    ]);
  }

  /**
   * Get summary statistics across all campaigns
   */
  static async getGlobalStats(): Promise<{
    activeCampaigns: number;
    totalEmailsSent: number;
    totalEmailsBounced: number;
    totalEmailsFailed: number;
  }> {
    try {
      const pattern = 'campaign:progress:*';
      const keys = await redis.keys(pattern);
      
      if (keys.length === 0) {
        return {
          activeCampaigns: 0,
          totalEmailsSent: 0,
          totalEmailsBounced: 0,
          totalEmailsFailed: 0
        };
      }

      let activeCampaigns = 0;
      let totalEmailsSent = 0;
      let totalEmailsBounced = 0;
      let totalEmailsFailed = 0;

      // Get all campaign data in parallel
      const pipeline = redis.pipeline();
      keys.forEach((key: string) => {
        pipeline.hgetall(key);
      });
      
      const results = await pipeline.exec();
      
      if (results) {
        results.forEach(([err, data]: [Error | null, any]) => {
          if (!err && data && typeof data === 'object') {
            const campaign = data as Record<string, string>;
            if (campaign.status === 'SENDING') {
              activeCampaigns++;
            }
            totalEmailsSent += parseInt(campaign.sentCount) || 0;
            totalEmailsBounced += parseInt(campaign.bouncedCount) || 0;
            totalEmailsFailed += parseInt(campaign.failedCount) || 0;
          }
        });
      }

      return {
        activeCampaigns,
        totalEmailsSent,
        totalEmailsBounced,
        totalEmailsFailed
      };
    } catch (error) {
      console.error('Error getting global stats:', error);
      return {
        activeCampaigns: 0,
        totalEmailsSent: 0,
        totalEmailsBounced: 0,
        totalEmailsFailed: 0
      };
    }
  }
}