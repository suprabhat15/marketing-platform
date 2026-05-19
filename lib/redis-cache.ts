import { redis } from './redis';

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  keyPrefix?: string;
}

export class RedisCache {
  private static defaultTTL = 60; // 1 minute default

  /**
   * Generate a cache key with optional prefix
   */
  private static generateKey(key: string, prefix?: string): string {
    return prefix ? `${prefix}:${key}` : key;
  }

  /**
   * Get cached data
   */
  static async get<T>(key: string, options: CacheOptions = {}): Promise<T | null> {
    try {
      const cacheKey = this.generateKey(key, options.keyPrefix);
      const cached = await redis.get(cacheKey);
      
      if (cached !== null && cached !== undefined) {
        // Upstash REST auto-deserializes stored JSON, so cached may already be
        // the parsed value rather than a raw string.
        if (typeof cached === 'string') {
          return JSON.parse(cached);
        }
        return cached as unknown as T;
      }
      
      return null;
    } catch (error) {
      console.error('Redis cache get error:', error);
      return null; // Fail silently, don't break the API
    }
  }

  /**
   * Set cached data with TTL
   */
  static async set(
    key: string, 
    data: any, 
    options: CacheOptions = {}
  ): Promise<boolean> {
    try {
      const cacheKey = this.generateKey(key, options.keyPrefix);
      const ttl = options.ttl ?? this.defaultTTL;
      
      await redis.setex(cacheKey, ttl, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('Redis cache set error:', error);
      return false; // Fail silently, don't break the API
    }
  }

  /**
   * Delete cached data
   */
  static async del(key: string, options: CacheOptions = {}): Promise<boolean> {
    try {
      const cacheKey = this.generateKey(key, options.keyPrefix);
      await redis.del(cacheKey);
      return true;
    } catch (error) {
      console.error('Redis cache delete error:', error);
      return false;
    }
  }

  /**
   * Delete multiple keys by pattern
   */
  static async delPattern(pattern: string, options: CacheOptions = {}): Promise<boolean> {
    try {
      const searchPattern = this.generateKey(pattern, options.keyPrefix);
      const keys: string[] = [];
      let cursor = '0';
      do {
        const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', searchPattern, 'COUNT', 100);
        cursor = nextCursor;
        keys.push(...batch);
      } while (cursor !== '0');

      if (keys.length > 0) {
        await redis.del(...keys);
      }
      
      return true;
    } catch (error) {
      console.error('Redis cache delete pattern error:', error);
      return false;
    }
  }

  /**
   * Get or set pattern - fetch from cache or execute callback and cache result
   */
  static async getOrSet<T>(
    key: string,
    callback: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key, options);
    if (cached !== null) {
      return cached;
    }

    // Execute callback to get fresh data
    const data = await callback();
    
    // Cache the result
    await this.set(key, data, options);
    
    return data;
  }
}

// Helper function to generate user-specific cache keys
export function generateUserCacheKey(userId: string, resource: string, params?: string): string {
  const baseKey = `${resource}:${userId}`;
  return params ? `${baseKey}:${params}` : baseKey;
}

// Helper function to invalidate user-specific cache
export async function invalidateUserCache(userId: string, resource?: string): Promise<void> {
  if (resource) {
    // Delete both the base key and any keys with parameters for this specific resource
    const baseKey = `${resource}:${userId}`;
    const paramPattern = `${resource}:${userId}:*`;
    
    // Delete base key (without parameters)
    await RedisCache.del(baseKey);
    
    // Delete all keys with parameters
    await RedisCache.delPattern(paramPattern);
  } else {
    // Delete all cache keys for this user across all resources
    const patterns = ['campaigns', 'templates', 'lists', 'domains'];
    for (const resourceType of patterns) {
      await RedisCache.del(`${resourceType}:${userId}`);
      await RedisCache.delPattern(`${resourceType}:${userId}:*`);
    }
  }
}