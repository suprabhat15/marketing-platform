/**
 * Standalone BullMQ worker process.
 * Run separately from the Next.js server:
 *   npx tsx worker.ts
 *
 * This process owns all Workers (campaign, batch, polar-ingestion).
 * The Next.js server is queue-producer only (queue-client.ts).
 */

import './lib/email-queues';
import { RedisConnectionManager } from './lib/redis';

console.log('🚀 Worker process started');

const shutdown = async (signal: string) => {
  console.log(`\n${signal} received — shutting down workers...`);

  const forceExit = setTimeout(() => {
    console.error('Forced exit after timeout');
    process.exit(1);
  }, 30_000);
  forceExit.unref();

  try {
    const { shutdownEmailQueues } = await import('./lib/email-queues');
    await shutdownEmailQueues();
    await RedisConnectionManager.disconnectAll();
    console.log('✅ Clean shutdown complete');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
