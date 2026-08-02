// Cross-process SSE event bus over Redis pub/sub.
//
// The SSE manager (lib/sse-manager.ts) keeps an in-memory connection Map that
// only lives in the Next.js process. BullMQ workers run in worker.ts as a
// separate Node process, so any broadcast made from a worker dead-ends in
// the worker's own (empty) Map. This module bridges that gap:
//
//   publisher (worker / API route)
//        |  redis.publish('sse:campaign:<id>', json)
//        v
//   one duplicated subscriber per Next.js process, psubscribe 'sse:campaign:*'
//        |  pmessage  ->  onMessage(campaignId, payload)
//        v
//   sse-manager fans out to the local connection Map for that campaign
//
// Publishing reuses the shared ioredis singleton (publish is safe on the main
// client). Subscribing requires its own connection (ioredis blocks normal
// commands once a client enters subscribe mode), so we duplicate once and
// keep that duplicate in globalThis to survive HMR.

import type Redis from 'ioredis';
import { redis } from './redis';

export const CHANNEL_PREFIX = 'sse:campaign:';
const CHANNEL_PATTERN = `${CHANNEL_PREFIX}*`;

export interface SSEPubMessage {
  type: string;
  data: Record<string, unknown>;
  id: string;
}

export async function publishCampaignEvent(
  campaignId: string,
  message: SSEPubMessage
): Promise<void> {
  try {
    await redis.publish(
      `${CHANNEL_PREFIX}${campaignId}`,
      JSON.stringify(message)
    );
  } catch (err) {
    console.error('[sse-pubsub] publish failed', { campaignId, err });
  }
}

const g = globalThis as unknown as { __sseSubscriber?: Redis };

export function ensureSubscriber(
  onMessage: (campaignId: string, message: SSEPubMessage) => void
): void {
  if (g.__sseSubscriber) return;

  const sub = redis.duplicate();
  sub.on('error', (err) => console.error('[sse-pubsub] subscriber error:', err));

  sub.psubscribe(CHANNEL_PATTERN).catch((err) =>
    console.error('[sse-pubsub] psubscribe failed:', err)
  );

  sub.on('pmessage', (_pattern, channel, raw) => {
    if (!channel.startsWith(CHANNEL_PREFIX)) return;
    const campaignId = channel.slice(CHANNEL_PREFIX.length);
    try {
      onMessage(campaignId, JSON.parse(raw) as SSEPubMessage);
    } catch (err) {
      console.error('[sse-pubsub] parse failure', { channel, err });
    }
  });

  g.__sseSubscriber = sub;
  console.log(`[sse-pubsub] subscribed to ${CHANNEL_PATTERN}`);
}
