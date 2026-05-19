import type Redis from 'ioredis';
import { Redis as UpstashRedis } from '@upstash/redis';

// ---------------------------------------------------------------------------
// Upstash REST client — HTTP-based, no persistent TCP connections
// ---------------------------------------------------------------------------
const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!upstashUrl || !upstashToken) {
  throw new Error(
    'Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN'
  );
}
const upstash = new UpstashRedis({
  url: upstashUrl,
  token: upstashToken,
  automaticDeserialization: false,
});

// ioredis-compatible shim over Upstash REST.
// Handles the handful of API differences so call sites don't need changes.
const upstashShim = {
  get: (key: string) => upstash.get<string>(key),

  // ioredis: set(key, value[, 'EX', secs][, 'PX', ms][, 'NX'|'XX'])
  set: (key: string, value: string, ...args: (string | number)[]) => {
    const opts: { ex?: number; px?: number; nx?: boolean; xx?: boolean } = {};
    for (let i = 0; i < args.length; i++) {
      const flag = String(args[i]).toUpperCase();
      if ((flag === 'EX' || flag === 'PX') && i + 1 < args.length) {
        const ms = parseInt(String(args[++i]), 10);
        if (flag === 'EX') opts.ex = ms; else opts.px = ms;
      } else if (flag === 'NX') {
        opts.nx = true;
      } else if (flag === 'XX') {
        opts.xx = true;
      }
    }
    return upstash.set(key, value, Object.keys(opts).length ? opts : undefined);
  },

  setex: (key: string, ttl: number, value: string) => upstash.setex(key, ttl, value),

  del: (...keys: string[]) => upstash.del(...keys),

  expire: (key: string, seconds: number) => upstash.expire(key, seconds),

  incr: (key: string) => upstash.incr(key),

  keys: (pattern: string) => upstash.keys(pattern),

  mget: (...keys: string[]) => upstash.mget<(string | null)[]>(...keys),

  // ioredis: scan(cursor, 'MATCH', pattern, 'COUNT', n) → Upstash: scan(cursor, { match, count })
  scan: async (cursor: string | number, ...args: (string | number)[]) => {
    let match: string | undefined;
    let count: number | undefined;
    for (let i = 0; i < args.length; i++) {
      if (String(args[i]).toUpperCase() === 'MATCH') match = args[i + 1] as string;
      if (String(args[i]).toUpperCase() === 'COUNT') count = parseInt(String(args[i + 1]));
    }
    const numCursor = typeof cursor === 'string' ? parseInt(cursor) || 0 : cursor;
    const [nextCursor, keys] = await upstash.scan(numCursor, { match, count });
    // Return string cursor to match ioredis contract (done when '0')
    return [nextCursor.toString(), keys] as [string, string[]];
  },

  // ioredis: zadd(key, score, member) → Upstash: zadd(key, { score, member })
  zadd: (key: string, ...args: any[]) => {
    if (typeof args[0] === 'number' && typeof args[1] === 'string') {
      return upstash.zadd(key, { score: args[0], member: args[1] });
    }
    return upstash.zadd(key, args[0]);
  },

  zcard: (key: string) => upstash.zcard(key),

  // ioredis zrange with WITHSCORES returns flat [member, score, ...] strings.
  // Upstash may return [{member, score}] objects — normalise either format.
  zrange: async (key: string, start: number, stop: number, withScores?: string) => {
    if (withScores?.toUpperCase() === 'WITHSCORES') {
      const result = await upstash.zrange(key, start, stop, { withScores: true });
      const flat: string[] = [];
      for (const item of result as any[]) {
        if (typeof item === 'object' && item !== null && 'member' in item) {
          flat.push(String(item.member), String(item.score));
        } else {
          flat.push(String(item));
        }
      }
      return flat;
    }
    return upstash.zrange(key, start, stop) as Promise<string[]>;
  },

  zremrangebyscore: (key: string, min: number | string, max: number | string) =>
    upstash.zremrangebyscore(key, min as number, max as number),

  // ioredis: hset(key, field, value) → Upstash: hset(key, { field: value })
  hset: (key: string, fieldOrObj: string | Record<string, any>, value?: string) => {
    if (typeof fieldOrObj === 'string') {
      return upstash.hset(key, { [fieldOrObj]: value ?? '' });
    }
    return upstash.hset(key, fieldOrObj);
  },

  hget: (key: string, field: string) => upstash.hget<string>(key, field),

  hgetall: (key: string) => upstash.hgetall<Record<string, string>>(key),
};

// ---------------------------------------------------------------------------
// RedisConnectionManager — stub kept for worker.ts shutdown compatibility
// ---------------------------------------------------------------------------
const globalForRedis = globalThis as unknown as {
  __redisInstances?: Map<string, any>;
  __redisShuttingDown?: boolean;
};

if (!globalForRedis.__redisInstances) {
  globalForRedis.__redisInstances = new Map();
}

class RedisConnectionManager {
  public static async disconnectAll(): Promise<void> {
    console.log('✅ Upstash REST client requires no persistent connections to close');
  }
}

// ---------------------------------------------------------------------------
// BullMQ connection — Upstash Redis-compatible TCP endpoint.
// Upstash exposes the same database over both REST (used above) and standard
// Redis TCP on port 6379 with TLS. The host is the REST URL without the scheme;
// the password is the REST token.
// ---------------------------------------------------------------------------
const _bullMQHost = (process.env.UPSTASH_REDIS_REST_URL ?? '')
  .replace(/^https?:\/\//, '')
  .split('/')[0]; // strip any path component, keep only the hostname

if (!_bullMQHost) {
  throw new Error(
    'UPSTASH_REDIS_REST_URL is not set — BullMQ cannot connect. ' +
    'Run the worker with: tsx --env-file=.env worker.ts'
  );
}

export const bullMQConnection = {
  host: _bullMQHost,
  port: 6379,
  password: process.env.UPSTASH_REDIS_REST_TOKEN,
  maxRetriesPerRequest: null as null,
  tls: {} as const,
  enableOfflineQueue: false,
  connectTimeout: 10_000,
  disconnectTimeout: 3_000,
  keepAlive: 30_000,
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
export const redis = upstashShim as unknown as Redis;
export const getRedisInstance = (
  _type: 'default' | 'queue' | 'worker' | 'dlq' = 'default'
) => upstashShim as unknown as Redis;

export { RedisConnectionManager };
export default RedisConnectionManager;
