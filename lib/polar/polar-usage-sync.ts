import { prisma } from '../prisma';
import { polar } from './polar-client';

export async function syncPendingPolarUsage(db = prisma, client = polar) {
  const pending = await db.emailCreditDelivery.findMany({
    where: {
      state: 'sent',
      polarSyncedAt: null,
      polarNextAttemptAt: { lte: new Date() },
    },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });
  for (const delivery of pending) {
    try {
      const result = await client.events.ingest(
        {
          events: [
            {
              name: 'SENT',
              externalId: `mailpackr-send:${delivery.id}`,
              externalCustomerId: delivery.userId,
              timestamp: delivery.sentAt!,
              metadata: {
                emailsSent: 1,
                campaignId: delivery.campaignId,
                subscriberId: delivery.subscriberId,
              },
            },
          ],
        },
        { timeoutMs: 10_000 }
      );
      if (result.inserted + (result.duplicates ?? 0) !== 1)
        throw new Error('Polar did not acknowledge the usage event');
      await db.emailCreditDelivery.updateMany({
        where: { id: delivery.id, polarSyncedAt: null },
        data: {
          polarSyncedAt: new Date(),
          polarNextAttemptAt: null,
        },
      });
    } catch (error) {
      // Persist retries; a restart cannot forget pending usage. A lost response
      // or simultaneous worker is safe because Polar deduplicates externalId.
      const attempts = delivery.polarAttempts + 1;
      await db.emailCreditDelivery.updateMany({
        where: { id: delivery.id, polarSyncedAt: null },
        data: {
          polarAttempts: attempts,
          polarNextAttemptAt: new Date(
            Date.now() + Math.min(300_000, 5000 * 2 ** Math.min(attempts, 6))
          ),
        },
      });
      console.error('Polar usage sync pending retry', {
        deliveryId: delivery.id,
        attempts,
      });
    }
  }
}

export function startPolarUsageSync() {
  let active: Promise<void> | null = null;
  const tick = () => {
    if (active) return;
    active = syncPendingPolarUsage()
      .catch((error) => {
        console.error('Polar usage sync failed', error);
      })
      .finally(() => {
        active = null;
      });
  };
  const timer = setInterval(tick, 5000);
  tick();
  return async () => {
    clearInterval(timer);
    await active;
  };
}
