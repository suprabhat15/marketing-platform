import Redis, { type RedisOptions } from 'ioredis';

// ✅ Optimized Redis config with connection pooling
const redisConfig: RedisOptions = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,

  // Connection pooling settings
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  // lazyConnect: true, // Connect only when needed
  keepAlive: 30000, // Keep connections alive for 30 seconds

  // Connection limits
  connectTimeout: 10000,
  commandTimeout: 5000,

  reconnectOnError: (err) => {
    const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
    if (targetErrors.some((msg) => err.message.includes(msg))) {
      console.warn('🔄 Reconnecting due to error:', err.message);
      return true;
    }
    return false;
  },

  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
};

class RedisConnectionManager {
  private static instances: Map<string, Redis> = new Map();
  private static isShuttingDown = false;

  public static getInstance(
    type: 'default' | 'queue' | 'worker' | 'dlq' = 'default'
  ): Redis {
    if (this.isShuttingDown) {
      throw new Error('Redis connection manager is shutting down');
    }

    if (!this.instances.has(type)) {
      const instance = new Redis(redisConfig);

      instance.on('error', (error: any) => {
        console.error(`Redis connection error (${type}):`, error);
      });

      instance.on('connect', () => {
        console.log(`✅ Connected to Redis (${type})`);
      });

      instance.on('ready', () => {
        console.log(`🚀 Redis connection ready (${type})`);
      });

      instance.on('close', () => {
        console.log(`❌ Redis connection closed (${type})`);
        // Remove from instances map when closed
        this.instances.delete(type);
      });

      instance.on('reconnecting', () => {
        console.log(`🔄 Redis reconnecting (${type})`);
      });

      this.instances.set(type, instance);
    }

    return this.instances.get(type)!;
  }

  public static async disconnectAll(): Promise<void> {
    this.isShuttingDown = true;
    console.log('🛑 Shutting down all Redis connections...');

    const disconnectPromises = Array.from(this.instances.entries()).map(
      async ([type, instance]) => {
        try {
          console.log(`📴 Disconnecting Redis (${type})`);
          await instance.quit();
        } catch (error) {
          console.error(`Error disconnecting Redis (${type}):`, error);
        }
      }
    );

    await Promise.allSettled(disconnectPromises);
    this.instances.clear();
    console.log('✅ All Redis connections closed');
  }

  public static getConnectionCount(): number {
    return this.instances.size;
  }

  public static getConnectionTypes(): string[] {
    return Array.from(this.instances.keys());
  }
}

// Register cleanup handlers
process.on('SIGTERM', async () => {
  await RedisConnectionManager.disconnectAll();
});

process.on('SIGINT', async () => {
  await RedisConnectionManager.disconnectAll();
});

process.on('beforeExit', async () => {
  await RedisConnectionManager.disconnectAll();
});

// Export instances
export const redis = RedisConnectionManager.getInstance('default');
export const getRedisInstance = (
  type: 'default' | 'queue' | 'worker' | 'dlq' = 'default'
) => RedisConnectionManager.getInstance(type);

export type redisOptions = RedisOptions;
export { RedisConnectionManager };
export default RedisConnectionManager;
