import { SESClient, GetSendQuotaCommand, GetSendStatisticsCommand } from '@aws-sdk/client-ses';
import { getRedisInstance } from './redis';
import { EmailType } from './queue-types';

interface SESQuotaInfo {
  maxSendRate: number;      // Max emails per second
  max24HourSend: number;    // Max emails per 24 hours
  sentLast24Hours: number;  // Emails sent in last 24 hours
  remainingQuota: number;   // Remaining quota for today
  lastUpdated: number;      // Timestamp of last update
}

interface QuotaAllocation {
  transactional: number;    // Allocated rate for transactional emails
  marketing: number;        // Allocated rate for marketing emails
  system: number;          // Allocated rate for system emails
  buffer: number;          // Reserved buffer for bursts
}

export class SESQuotaManager {
  private static instance: SESQuotaManager;
  private sesClient: SESClient;
  private redis = getRedisInstance('default');
  private quotaCache: SESQuotaInfo | null = null;
  private allocationCache: QuotaAllocation | null = null;
  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly QUOTA_CACHE_KEY = 'ses:quota:info';
  private readonly ALLOCATION_CACHE_KEY = 'ses:quota:allocation';

  private constructor() {
    this.sesClient = new SESClient({
      region: process.env.AWS_REGION!,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }

  public static getInstance(): SESQuotaManager {
    if (!SESQuotaManager.instance) {
      SESQuotaManager.instance = new SESQuotaManager();
    }
    return SESQuotaManager.instance;
  }


  /**
   * Fetch current SES quota from AWS API
   */
  public async fetchSESQuota(): Promise<SESQuotaInfo> {
    try {
      const [quotaResponse, statsResponse] = await Promise.all([
        this.sesClient.send(new GetSendQuotaCommand({})),
        this.sesClient.send(new GetSendStatisticsCommand({}))
      ]);

      // Calculate sent emails in last 24 hours from statistics
      const now = Date.now();
      const last24Hours = now - (24 * 60 * 60 * 1000);
      
      let sentLast24Hours = 0;
      if (statsResponse.SendDataPoints) {
        sentLast24Hours = statsResponse.SendDataPoints
          .filter(point => point.Timestamp && point.Timestamp.getTime() > last24Hours)
          .reduce((sum, point) => sum + (point.DeliveryAttempts || 0), 0);
      }

      const maxSendRate = quotaResponse.MaxSendRate || 1;
      const max24HourSend = quotaResponse.Max24HourSend || 200;
      const remainingQuota = Math.max(0, max24HourSend - sentLast24Hours);

      const quotaInfo: SESQuotaInfo = {
        maxSendRate,
        max24HourSend,
        sentLast24Hours,
        remainingQuota,
        lastUpdated: now
      };

      // Cache the quota info
      await this.redis.set(
        this.QUOTA_CACHE_KEY, 
        JSON.stringify(quotaInfo), 
        'EX', 
        this.CACHE_TTL
      );

      this.quotaCache = quotaInfo;
      
      console.log(`📊 SES Quota Updated: ${maxSendRate}/sec, ${remainingQuota}/${max24HourSend} daily remaining`);
      
      return quotaInfo;
    } catch (error) {
      console.error('❌ Failed to fetch SES quota:', error);
      
      // Return cached quota or conservative defaults
      if (this.quotaCache) {
        console.log('🔄 Using cached SES quota due to API error');
        return this.quotaCache;
      }
      
      console.log('⚠️ Using conservative SES quota defaults due to API error');
      return {
        maxSendRate: 1,
        max24HourSend: 200,
        sentLast24Hours: 0,
        remainingQuota: 200,
        lastUpdated: Date.now()
      };
    }
  }

  /**
   * Get cached quota info or fetch from AWS if expired
   */
  public async getQuotaInfo(): Promise<SESQuotaInfo> {
    try {
      // Try to get from cache first
      const cached = await this.redis.get(this.QUOTA_CACHE_KEY);
      if (cached) {
        const quotaInfo = JSON.parse(cached) as SESQuotaInfo;
        const age = Date.now() - quotaInfo.lastUpdated;
        
        // Use cached data if less than 5 minutes old
        if (age < this.CACHE_TTL * 1000) {
          this.quotaCache = quotaInfo;
          return quotaInfo;
        }
      }
    } catch (error) {
      console.error('Cache read error for SES quota:', error);
    }

    // Fetch fresh data from AWS
    return await this.fetchSESQuota();
  }

  /**
   * Check if we can send more emails today (24-hour quota check)
   */
  public async canSendToday(count: number = 1): Promise<boolean> {
    const quotaInfo = await this.getQuotaInfo();
    return quotaInfo.remainingQuota >= count;
  }

  /**
   * Check if we can send a campaign with given email count
   */
  public async canSendCampaign(emailCount: number): Promise<{ canSend: boolean; reason?: string; quotaInfo: SESQuotaInfo }> {
    const quotaInfo = await this.fetchSESQuota(); // Always fetch fresh for campaign decisions
    
    if (quotaInfo.remainingQuota < emailCount) {
      return {
        canSend: false,
        reason: `Insufficient daily quota: need ${emailCount}, have ${quotaInfo.remainingQuota} remaining`,
        quotaInfo
      };
    }

    return {
      canSend: true,
      quotaInfo
    };
  }

  /**
   * Get percentage of daily quota used
   */
  public async getDailyQuotaUsagePercent(): Promise<number> {
    const quotaInfo = await this.getQuotaInfo();
    if (quotaInfo.max24HourSend === 0) return 0;
    return (quotaInfo.sentLast24Hours / quotaInfo.max24HourSend) * 100;
  }

  /**
   * Get current rate including any active boosts
   */
  public async getCurrentRate(emailType: EmailType): Promise<number> {
    const boostKey = `ses:boost:${emailType}`;
    
    try {
      const boostedRate = await this.redis.get(boostKey);
      if (boostedRate) {
        return parseInt(boostedRate, 10);
      }
    } catch (error) {
      console.error('Failed to get boosted rate:', error);
    }
    
    // Fallback to basic allocation
    const quotaInfo = await this.getQuotaInfo();
    const availableRate = quotaInfo.maxSendRate;
    
    // Simple allocation based on email type
    let allocatedRate: number;
    switch (emailType) {
      case 'transactional':
        allocatedRate = Math.max(1, Math.ceil(availableRate * 0.3));
        break;
      case 'marketing':
        // Use 30% to be very conservative and account for AWS rate enforcement variations
        allocatedRate = Math.max(1, Math.floor(availableRate * 0.3));
        break;
      case 'system':
        allocatedRate = Math.max(1, Math.ceil(availableRate * 0.1));
        break;
      default:
        allocatedRate = Math.max(1, Math.ceil(availableRate * 0.6));
    }
    
    console.log(
      `📊 Rate limit for ${emailType}: ${allocatedRate}/sec (AWS max: ${availableRate}/sec)`
    );
    return allocatedRate;
  }

  /**
   * Force refresh quota from AWS (bypass cache)
   */
  public async refreshQuota(): Promise<SESQuotaInfo> {
    console.log('🔄 Force refreshing SES quota from AWS...');
    return await this.fetchSESQuota();
  }
}

// Export singleton instance
export const sesQuotaManager = SESQuotaManager.getInstance();