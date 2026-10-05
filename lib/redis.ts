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
    // Keep the socket warm so idle-timeout proxies (NLB, managed Redis LBs,
    // etc.) don't silently reap long-lived worker connections. BullMQ
    // duplicates this client for its blocking connection and inherits the
    // setting, so workers stay alive across long idle periods too.
    keepAlive: 30_000,
  });

  g.__redis.on('error', (err) => console.error('[redis] error:', err));
}

export const redis = g.__redis;

// ---------------------------------------------------------------------------
// BullMQ connection — pass the SHARED singleton instance, not a config object.
//
// If you pass a plain options object, BullMQ does `new IORedis(opts)` for every
// Queue AND every Worker, so the globalThis singleton never applies and
// connections multiply until Redis hits max-clients. Passing the shared
// instance makes all Queue producers reuse this one socket; Workers internally
// `.duplicate()` it for their required blocking connection, so the only
// unavoidable per-process growth is one blocking socket per Worker.
//
// Requires `maxRetriesPerRequest: null` on the shared client (set above) —
// BullMQ enforces this for the blocking connection.
// ---------------------------------------------------------------------------
export const bullMQConnection = redis;

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
