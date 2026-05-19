import Redis from 'ioredis';

// ---------------------------------------------------------------------------
// Global singleton — one TCP connection per process.
// Without this, Next.js hot reloads create a new ioredis instance on every
// module re-evaluation, leaking connections until Redis hits max-clients.
// ---------------------------------------------------------------------------
const g = globalThis as typeof globalThis & { __redis?: Redis };

if (!g.__redis) {
  if (!process.env.REDIS_HOST) {
    throw new Error('REDIS_HOST environment variable is required');
  }
  
  g.__redis = new Redis({
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectionName: 'app-main',
  });

  g.__redis.on('error', (err) => console.error('[redis] error:', err));
}

export const redis = g.__redis;

// ---------------------------------------------------------------------------
// BullMQ connection — BullMQ manages its own ioredis instances internally
// (needs a separate blocking connection). Pass config, not a shared client.
// ---------------------------------------------------------------------------
export const bullMQConnection = {
  host: process.env.REDIS_HOST!,
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  tls: process.env.REDIS_TLS === 'true' ? ({} as const) : undefined,
  maxRetriesPerRequest: null as null,
  enableOfflineQueue: false,
  connectTimeout: 10_000,
  disconnectTimeout: 3_000,
  keepAlive: 30_000,
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
export const getRedisInstance = (
  _type: 'default' | 'queue' | 'worker' | 'dlq' = 'default'
) => redis;

export class RedisConnectionManager {
  static async disconnectAll() {
    await g.__redis?.quit();
  }
}

export default RedisConnectionManager;
