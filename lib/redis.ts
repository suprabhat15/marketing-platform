import Redis, { type RedisOptions } from 'ioredis';

// Persist connections across Next.js hot reloads in development
const globalForRedis = globalThis as unknown as {
  __redisInstances?: Map<string, Redis>;
  __redisShuttingDown?: boolean;
};

if (!globalForRedis.__redisInstances) {
  globalForRedis.__redisInstances = new Map();
}

const redisConfig: RedisOptions = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,

  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: false,
  keepAlive: 30000,

  connectTimeout: 20000,
  commandTimeout: 10000,

  // Cap reconnect delay at 5s to avoid snowballing connections
  retryStrategy: (times) => {
    if (globalForRedis.__redisShuttingDown) return null;
    return Math.min(times * 500, 5000);
  },

  reconnectOnError: (err) => {
    const targetErrors = [
      'READONLY',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ECONNREFUSED',
    ];
    if (targetErrors.some((msg) => err.message.includes(msg))) {
      console.warn('🔄 Reconnecting due to error:', err.message);
      return true;
    }
    return false;
  },

  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
};

class RedisConnectionManager {
  private static get instances(): Map<string, Redis> {
    return globalForRedis.__redisInstances!;
  }

  private static get isShuttingDown(): boolean {
    return globalForRedis.__redisShuttingDown ?? false;
  }

  private static set isShuttingDown(value: boolean) {
    globalForRedis.__redisShuttingDown = value;
  }

  public static getInstance(
    type: 'default' | 'queue' | 'worker' | 'dlq' = 'default'
  ): Redis {
    if (this.isShuttingDown) {
      throw new Error('Redis connection manager is shutting down');
    }

    const existing = this.instances.get(type);
    if (existing && existing.status !== 'end') {
      return existing;
    }

    // Clean up ended connection before creating new one
    if (existing) {
      this.instances.delete(type);
    }

    const instance = new Redis(redisConfig);

    instance.on('error', (error: any) => {
      console.error(`❌ Redis connection error (${type}):`, error.message);
    });

    instance.on('connect', () => {
      console.log(`✅ Connected to Redis (${type})`);
    });

    instance.on('ready', () => {
      console.log(`🚀 Redis connection ready (${type})`);
    });

    // Don't remove from instances on close — let ioredis handle reconnection
    instance.on('close', () => {
      console.log(`❌ Redis connection closed (${type})`);
    });

    instance.on('reconnecting', (time: number) => {
      console.log(`🔄 Redis reconnecting (${type}) in ${time}ms`);
    });

    instance.on('end', () => {
      console.log(`🛑 Redis connection ended (${type})`);
      this.instances.delete(type);
    });

    this.instances.set(type, instance);
    return instance;
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
}

// Register cleanup handlers (only once across hot reloads)
const globalCleanup = globalThis as unknown as { __redisCleanupRegistered?: boolean };
if (!globalCleanup.__redisCleanupRegistered) {
  globalCleanup.__redisCleanupRegistered = true;

  const shutdown = async (signal: string) => {
    // Force exit if graceful shutdown hangs
    const forceExitTimeout = setTimeout(() => {
      console.error('⚠️ Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, 30000);
    forceExitTimeout.unref();

    try {
      await RedisConnectionManager.disconnectAll();
      process.exitCode = 0;
    } catch (error) {
      console.error('Error during Redis shutdown:', error);
      process.exitCode = 1;
    }
  };
  process.on('SIGTERM', () => {
    shutdown('SIGTERM').catch(() => {});
  });
  process.on('SIGINT', () => {
    shutdown('SIGINT').catch(() => {});
  });
}

// Shared connection options for BullMQ — pass these instead of an ioredis instance
// so BullMQ creates exactly the connections it needs without an extra "parent" connection.
export const bullMQConnection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null as null, // required by BullMQ
  tls: process.env.REDIS_TLS === 'true' ? ({} as const) : undefined,
};

// Export instances
export const redis = RedisConnectionManager.getInstance('default');
export const getRedisInstance = (
  type: 'default' | 'queue' | 'worker' | 'dlq' = 'default'
) => RedisConnectionManager.getInstance(type);

export { RedisConnectionManager };
export default RedisConnectionManager;
