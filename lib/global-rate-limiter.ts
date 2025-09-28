import { redis } from './redis';

export interface RateLimitResult {
  allowed: boolean;
  waitTimeMs: number;
  currentCount: number;
  nextRequestDelay?: number;
}

export class GlobalRateLimiter {
  private readonly key: string;
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(
    key: string = 'ses:global-rate-limit',
    limit: number = parseInt(process.env.AWS_SES_RATE_LIMIT || '5'),
    windowMs: number = 2000
  ) {
    this.key = key;
    this.limit = limit;
    this.windowMs = windowMs;
  }

  /**
   * Attempt to acquire a permit to send an email
   * Returns immediately with permission status and wait time
   */
  async tryAcquire(): Promise<RateLimitResult> {
    try {
      const now = Date.now();
      const min = now - this.windowMs;

      // Clean up expired entries and get current count
      await redis.zremrangebyscore(this.key, 0, min);
      const currentCount = await redis.zcard(this.key);

      if (currentCount >= this.limit) {
        // Find the oldest request timestamp to calculate wait time
        const oldest = await redis.zrange(this.key, 0, 0, 'WITHSCORES');
        let waitTimeMs = 0;
        
        if (oldest.length >= 2) {
          const oldestTimestamp = parseInt(oldest[1]);
          waitTimeMs = Math.max(0, (oldestTimestamp + this.windowMs) - now);
        }
        
        return {
          allowed: false,
          waitTimeMs,
          currentCount
        };
      }

      // Request is allowed, add it to the set
      const requestId = `${now}-${Math.random().toString(36).substr(2, 9)}`;
      await redis.zadd(this.key, now, requestId);
      await redis.expire(this.key, Math.ceil(this.windowMs / 1000));

      // Calculate even spacing hint for the next request
      const nextRequestDelay = currentCount > 0 ? Math.floor(this.windowMs / this.limit) : 0;

      return {
        allowed: true,
        waitTimeMs: 0,
        currentCount: currentCount + 1,
        nextRequestDelay
      };
    } catch (error) {
      console.error('Rate limiter error:', error);
      // Fail open - allow the request if Redis is down
      return {
        allowed: true,
        waitTimeMs: 0,
        currentCount: 0
      };
    }
  }

  /**
   * Acquire a permit, waiting if necessary
   * This will wait for the specified time if rate limited
   */
  async acquire(): Promise<RateLimitResult> {
    const result = await this.tryAcquire();
    
    if (!result.allowed && result.waitTimeMs > 0) {
      // Wait for the specified time
      await new Promise(resolve => setTimeout(resolve, result.waitTimeMs));
      // Try again (should now be allowed)
      return await this.tryAcquire();
    }
    
    return result;
  }

  /**
   * Get current rate limit status without attempting to acquire
   */
  async getStatus(): Promise<{ currentCount: number; limit: number; windowMs: number }> {
    try {
      const now = Date.now();
      const min = now - this.windowMs;
      
      // Clean up expired entries and get current count
      await redis.zremrangebyscore(this.key, 0, min);
      const currentCount = await redis.zcard(this.key);
      
      return {
        currentCount,
        limit: this.limit,
        windowMs: this.windowMs
      };
    } catch (error) {
      console.error('Error getting rate limit status:', error);
      return {
        currentCount: 0,
        limit: this.limit,
        windowMs: this.windowMs
      };
    }
  }

  /**
   * Reset the rate limiter (useful for testing)
   */
  async reset(): Promise<void> {
    await redis.del(this.key);
  }
}

// Default global instance
export const globalRateLimiter = new GlobalRateLimiter();