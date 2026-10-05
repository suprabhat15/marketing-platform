import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import type { Order } from '@polar-sh/sdk/models/components/order';
import type { prisma } from '../lib/prisma';

// Opt-in integration suite. Never load .env and never use DATABASE_URL.
const testUrl = process.env.BILLING_TEST_DATABASE_URL;
test(
  'PostgreSQL billing transactions, concurrent orders and rollback',
  { skip: !testUrl },
  async (t) => {
    const url = new URL(testUrl!);
    assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
    assert.equal(url.pathname, '/mailpackr_billing_test');
    process.env.POLAR_ACCESS_TOKEN = 'test-only';
    process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID_3K = 'test-product-3000';
    process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID_10K = 'test-product-10000';
    process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID_20K = 'test-product-20000';
    const db = new PrismaClient({ datasourceUrl: testUrl });
    (globalThis as unknown as { prisma: unknown }).prisma = db;
    const { createBillingWebhookService } =
      await import('../lib/polar/polar-webhook.service');
    const { createEmailCreditService } =
      await import('../lib/email-credit.service');
    const emailCredits = createEmailCreditService(
      db as unknown as typeof prisma
    );
    const service = createBillingWebhookService({
      db: db as unknown as typeof prisma,
    });
    const purchase = (userId: string, id: string) =>
      ({
        id,
        status: 'paid',
        paid: true,
        refundedAmount: 0,
        productId: 'test-product-3000',
        product: null,
        customerId: `customer-${userId}`,
        customer: { id: `customer-${userId}`, externalId: userId },
        metadata: {},
        totalAmount: 100,
        currency: 'usd',
        subscriptionId: null,
        subscription: null,
        billingReason: 'purchase',
        createdAt: new Date(),
      }) as unknown as Order;
    const createUser = (id: string) =>
      db.user.create({
        data: { id, name: 'Billing test', email: `${id}@billing.test.invalid` },
      });
    try {
      await t.test('parallel redeliveries allocate once', async () => {
        await createUser('billing-concurrent-duplicate');
        const order = purchase(
          'billing-concurrent-duplicate',
          'concurrent-order'
        );
        await Promise.all(
          Array.from({ length: 4 }, () => service.fulfillPaidOrder(order))
        );
        assert.equal(
          await db.creditLedger.count({
            where: { userId: 'billing-concurrent-duplicate' },
          }),
          1
        );
        assert.equal(
          (
            await db.creditBalance.findUniqueOrThrow({
              where: { userId: 'billing-concurrent-duplicate' },
            })
          ).remainingCredits,
          3000
        );
      });
      await t.test(
        'parallel distinct purchases and usage do not lose increments',
        async () => {
          const id = 'billing-concurrent-distinct';
          await createUser(id);
          await service.fulfillPaidOrder(purchase(id, 'first-order'));
          await Promise.all([
            service.fulfillPaidOrder(purchase(id, 'second-order')),
            service.fulfillPaidOrder(purchase(id, 'third-order')),
            emailCredits.send(
              id,
              `campaign-${id}`,
              'subscriber',
              'attempt',
              async () => ({ success: true })
            ),
          ]);
          const balance = await db.creditBalance.findUniqueOrThrow({
            where: { userId: id },
          });
          assert.equal(balance.totalCredits, 9000);
          assert.equal(balance.usedCredits, 1);
          assert.equal(balance.remainingCredits, 8999);
        }
      );
      await t.test(
        'concurrent workers cannot spend the same final credit or send a delivery twice',
        async () => {
          const id = 'billing-final-credit';
          await createUser(id);
          await db.creditBalance.create({
            data: { userId: id, totalCredits: 1, remainingCredits: 1 },
          });
          await db.creditLedger.create({
            data: { userId: id, type: 'CREDIT_ALLOCATION', amount: 1 },
          });
          let sends = 0;
          const results = await Promise.allSettled([
            emailCredits.send(id, `campaign-${id}`, 'one', 'attempt-a', async () => {
              sends++;
              return { success: true };
            }),
            emailCredits.send(id, `campaign-${id}`, 'two', 'attempt-b', async () => {
              sends++;
              return { success: true };
            }),
          ]);
          assert.equal(
            results.filter((result) => result.status === 'fulfilled').length,
            1
          );
          assert.equal(sends, 1);
          const balance = await db.creditBalance.findUniqueOrThrow({
            where: { userId: id },
          });
          assert.equal(balance.usedCredits, 1);
          assert.equal(balance.remainingCredits, 0);
          assert.equal(
            await db.emailCreditDelivery.count({
              where: { userId: id, state: 'sent', polarSyncedAt: null },
            }),
            1
          );
        }
      );
      await t.test(
        'parallel attempts for the same delivery contact SES at most once',
        async () => {
          const id = 'billing-same-delivery';
          await createUser(id);
          await service.fulfillPaidOrder(
            purchase(id, 'same-delivery-purchase')
          );
          let sends = 0;
          await Promise.allSettled(
            Array.from({ length: 4 }, (_, i) =>
              emailCredits.send(
                id,
                `campaign-${id}`,
                'one',
                `attempt-${i}`,
                async () => {
                  sends++;
                  return { success: true };
                }
              )
            )
          );
          assert.equal(sends, 1);
          assert.equal(
            (
              await db.creditBalance.findUniqueOrThrow({
                where: { userId: id },
              })
            ).usedCredits,
            1
          );
          assert.equal(
            await db.emailCreditDelivery.count({
              where: { userId: id, state: 'sent', polarSyncedAt: null },
            }),
            1
          );
        }
      );
      await t.test(
        'revocation races with a reserved send rejection without restoring revoked credits',
        async () => {
          const id = 'billing-revoke-race';
          await createUser(id);
          const sub = {
            id: 'revoke-subscription',
            status: 'active',
            productId: 'test-product-3000',
            customerId: `customer-${id}`,
            customer: { id: `customer-${id}`, externalId: id },
            currentPeriodStart: new Date('2026-10-01'),
            currentPeriodEnd: new Date('2026-11-01'),
          };
          await service.fulfillPaidOrder({
            ...purchase(id, 'revoke-order'),
            subscriptionId: sub.id,
            subscription: sub,
            billingReason: 'subscription_create',
          } as unknown as Order);
          await service.fulfillPaidOrder(purchase(id, 'unrelated-topup'));
          const reservation = await emailCredits.reserve(
            id,
            `campaign-${id}`,
            'one',
            'attempt'
          );
          if (reservation.outcome !== 'reserved')
            throw new Error('Expected reservation');
          await Promise.all([
            service.revokeSubscription(sub),
            emailCredits.settle(
              id,
              reservation.key,
              reservation.reservationId,
              'failed'
            ),
          ]);
          const balance = await db.creditBalance.findUniqueOrThrow({
            where: { userId: id },
          });
          assert.equal(balance.remainingCredits, 3000);
          assert.equal(balance.usedCredits, 0);
          assert.equal(balance.totalCredits, 3000);
          const net = await db.creditLedger.aggregate({
            where: { userId: id },
            _sum: { amount: true },
          });
          assert.equal(net._sum.amount, balance.remainingCredits);
        }
      );
      await t.test(
        'parallel sync workers deliver one logical Polar event',
        async () => {
          const id = 'billing-outbox-race';
          await createUser(id);
          await service.fulfillPaidOrder(purchase(id, 'outbox-order'));
          await emailCredits.send(
            id,
            `campaign-${id}`,
            'one',
            'attempt',
            async () => ({ success: true })
          );
          const { syncPendingPolarUsage } =
            await import('../lib/polar/polar-usage-sync');
          const { polar } = await import('../lib/polar/polar-client');
          const received = new Set<string>();
          const client = {
            events: {
              ingest: async (data: {
                events: Array<{ externalId: string }>;
              }) => {
                const eventId = data.events[0].externalId;
                if (received.has(eventId))
                  return { inserted: 0, duplicates: 1 };
                received.add(eventId);
                return { inserted: 1, duplicates: 0 };
              },
            },
          } as unknown as typeof polar;
          await Promise.all([
            syncPendingPolarUsage(db as unknown as typeof prisma, client),
            syncPendingPolarUsage(db as unknown as typeof prisma, client),
          ]);
          assert.equal(
            await db.emailCreditDelivery.count({
              where: { userId: id, state: 'sent', polarSyncedAt: null },
            }),
            0
          );
          assert.equal(
            await db.emailCreditDelivery.count({
              where: {
                userId: id,
                state: 'sent',
                polarSyncedAt: { not: null },
              },
            }),
            1
          );
          assert.equal(
            (
              await db.creditBalance.findUniqueOrThrow({
                where: { userId: id },
              })
            ).usedCredits,
            1
          );
        }
      );
      await t.test(
        'database rejection rolls back paid order and ledger with the balance',
        async () => {
          const id = 'billing-rollback';
          await createUser(id);
          await db.$executeRawUnsafe(
            `ALTER TABLE credit_balance ADD CONSTRAINT billing_test_reject CHECK ("userId" <> 'billing-rollback')`
          );
          try {
            await assert.rejects(
              service.fulfillPaidOrder(purchase(id, 'rollback-order'))
            );
            assert.equal(await db.order.count({ where: { userId: id } }), 0);
            assert.equal(
              await db.creditLedger.count({ where: { userId: id } }),
              0
            );
            assert.equal(
              await db.creditBalance.count({ where: { userId: id } }),
              0
            );
          } finally {
            await db.$executeRawUnsafe(
              'ALTER TABLE credit_balance DROP CONSTRAINT billing_test_reject'
            );
          }
          await service.fulfillPaidOrder(purchase(id, 'rollback-order'));
          assert.equal(
            await db.creditLedger.count({ where: { userId: id } }),
            1
          );
        }
      );
    } finally {
      await db.user.deleteMany({
        where: { email: { endsWith: '@billing.test.invalid' } },
      });
      await db.$disconnect();
    }
  }
);
