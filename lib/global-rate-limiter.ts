import { redis } from './redis';
import { sesQuotaManager } from './ses-quota-manager';
import { EmailType } from './queue-types';

export interface RateLimitResult {
  allowed: boolean;
  waitTimeMs: number;
  currentCount: number;
  nextRequestDelay?: number;
  quotaRemaining?: number;
  emailType?: EmailType;
}

export class EnhancedRateLimiter {
  private readonly baseKey: string;
  private readonly windowMs: number;
  private cachedLimits: Map<EmailType, number> = new Map();

  constructor(
    baseKey: string = 'ses:rate-limit',
    windowMs: number = 1000 // 1 second window
  ) {
    this.baseKey = baseKey;
    this.windowMs = windowMs;
  }

  /**
   * Get rate limit key for specific email type
   */
  private getRateLimitKey(emailType: EmailType): string {
    return `${this.baseKey}:${emailType}`;
  }

  /**
   * Attempt to acquire a permit to send an email (rate limiting only, no quota checks)
   * Quota should be checked ONCE before campaign starts via canSendCampaign()
   */
  async tryAcquire(emailType: EmailType): Promise<RateLimitResult> {
    try {
      const now = Date.now();
      const min = now - this.windowMs;
      const key = this.getRateLimitKey(emailType);

      let limit = this.cachedLimits.get(emailType);
      if (!limit) {
        // First time - fetch and cache
        limit = await sesQuotaManager.getCurrentRate(emailType);
        this.cachedLimits.set(emailType, limit);
      }

      // Clean up expired entries and get current count
      await redis.zremrangebyscore(key, 0, min);
      const currentCount = await redis.zcard(key);

      if (currentCount >= limit) {
        // Find the oldest request timestamp to calculate wait time
        const oldest = await redis.zrange(key, 0, 0, 'WITHSCORES');
        let waitTimeMs = 0;

        if (oldest.length >= 2) {
          const oldestTimestamp = parseInt(oldest[1]);
          waitTimeMs = Math.max(0, oldestTimestamp + this.windowMs - now);
        }

        return {
          allowed: false,
          waitTimeMs,
          currentCount,
          emailType,
        };
      }

      // Request is allowed, add it to the set
      const requestId = `${now}-${Math.random().toString(36).substr(2, 9)}`;
      await redis.zadd(key, now, requestId);
      await redis.expire(key, Math.ceil(this.windowMs / 1000) + 1);

      // Calculate conservative spacing hint
      const nextRequestDelay =
        limit > 0 ? Math.max(500, Math.floor(this.windowMs / limit)) : 500;

      return {
        allowed: true,
        waitTimeMs: 0,
        currentCount: currentCount + 1,
        nextRequestDelay,
        emailType,
      };
    } catch (error) {
      console.error('Rate limiter error:', error);
      // Fail open but with conservative defaults
      return {
        allowed: true,
        waitTimeMs: 0,
        currentCount: 0,
        nextRequestDelay: 200,
        emailType,
      };
    }
  }

  /**
   * Acquire a permit, waiting if necessary with intelligent backoff
   */
  async acquire(
    emailType: EmailType,
    maxWaitMs: number = 30000
  ): Promise<RateLimitResult> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const result = await this.tryAcquire(emailType);

      if (result.allowed) {
        return result;
      }

      // Wait based on rate limit or use intelligent backoff
      const waitTime = result.waitTimeMs > 0 ? result.waitTimeMs : 1000;
      const cappedWaitTime = Math.min(waitTime, 5000); // Max 5 second wait

      await new Promise((resolve) => setTimeout(resolve, cappedWaitTime));
    }

    // If we've waited too long, return the last result
    return await this.tryAcquire(emailType);
  }

  /**
   * Get current rate limit status for a specific email type
   */
  async getStatus(emailType: EmailType): Promise<{
    currentCount: number;
    limit: number;
    windowMs: number;
  }> {
    try {
      const now = Date.now();
      const min = now - this.windowMs;
      const key = this.getRateLimitKey(emailType);

      // Clean up expired entries and get current count
      await redis.zremrangebyscore(key, 0, min);
      const currentCount = await redis.zcard(key);

      // Use cached limit or fetch and cache
      let limit = this.cachedLimits.get(emailType);
      if (!limit) {
        limit = await sesQuotaManager.getCurrentRate(emailType);
        this.cachedLimits.set(emailType, limit);
      }

      return {
        currentCount,
        limit,
        windowMs: this.windowMs,
      };
    } catch (error) {
      console.error('Error getting rate limit status:', error);
      return {
        currentCount: 0,
        limit: 1,
        windowMs: this.windowMs,
      };
    }
  }

  /**
   * Reset rate limiter for specific email type
   */
  async reset(emailType: EmailType): Promise<void> {
    const key = this.getRateLimitKey(emailType);
    await redis.del(key);
  }

  /**
   * Reset all rate limiters
   */
  async resetAll(): Promise<void> {
    const emailTypes: EmailType[] = ['transactional', 'marketing', 'system'];
    const deletePromises = emailTypes.map((type) => this.reset(type));
    await Promise.all(deletePromises);
  }

  /**
   * Get comprehensive status for all email types
   */
  async getAllStatus(): Promise<{
    [K in EmailType]: Awaited<ReturnType<typeof this.getStatus>>;
  }> {
    const emailTypes: EmailType[] = ['transactional', 'marketing', 'system'];
    const statuses = await Promise.all(
      emailTypes.map(
        async (type) => [type, await this.getStatus(type)] as const
      )
    );

    return Object.fromEntries(statuses) as {
      [K in EmailType]: Awaited<ReturnType<typeof this.getStatus>>;
    };
  }

  /**
   * Force refresh SES quota and recalculate rates
   */
  async refreshQuotaLimits(): Promise<void> {
    console.log('🔄 Refreshing SES quota and rate limits...');
    await sesQuotaManager.refreshQuota();
    this.cachedLimits.clear(); // Will be lazily repopulated on next tryAcquire()
  }
}

// Enhanced global instance with backward compatibility
export const enhancedRateLimiter = new EnhancedRateLimiter();

// Legacy global instance for backward compatibility
export class GlobalRateLimiter {
  private enhancedLimiter = enhancedRateLimiter;

  async acquire(): Promise<RateLimitResult> {
    // Default to marketing type for backward compatibility
    return await this.enhancedLimiter.acquire('marketing');
  }

  async tryAcquire(): Promise<RateLimitResult> {
    return await this.enhancedLimiter.tryAcquire('marketing');
  }

  async getStatus(): Promise<{
    currentCount: number;
    limit: number;
    windowMs: number;
  }> {
    const status = await this.enhancedLimiter.getStatus('marketing');
    return {
      currentCount: status.currentCount,
      limit: status.limit,
      windowMs: status.windowMs,
    };
  }

  async reset(): Promise<void> {
    await this.enhancedLimiter.resetAll();
  }
}

export const globalRateLimiter = new GlobalRateLimiter();