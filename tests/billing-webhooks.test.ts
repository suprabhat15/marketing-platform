import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import type { Order } from '@polar-sh/sdk/models/components/order';
import type { Subscription } from '@polar-sh/sdk/models/components/subscription';
import type { prisma } from '../lib/prisma';

// Never use developer/production credentials in the regression suite.
process.env.POLAR_ACCESS_TOKEN = 'billing-test-token';
process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID_3K = 'product-3000';
process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID_10K = 'product-10000';
process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID_20K = 'product-20000';
delete process.env.REDIS_HOST;
// lib/prisma reuses this singleton, preventing any real client or network
// activity when importing the service and HTTP route for isolated tests.
(globalThis as unknown as { prisma: unknown }).prisma = {};

const { createBillingWebhookService, billingWebhookService } =
  await import('../lib/polar/polar-webhook.service');

// Model transactional rollback, unique ledger references, and atomic increments.
// Assertions below exercise purchase lifecycle behavior across multiple deliveries.
type Row = Record<string, any>;
class BillingDatabase {
  state = {
    subscriptions: [] as Row[],
    orders: [] as Row[],
    ledger: [] as Row[],
    balances: [] as Row[],
    deliveries: [] as Row[],
  };
  failBalance = false;
  emailCreditDelivery = {
    findUnique: async ({ where }: Row) =>
      this.state.deliveries.find((row) => row.id === where.id) ?? null,
    create: async ({ data }: Row) => {
      if (this.state.deliveries.some((row) => row.id === data.id))
        throw Object.assign(new Error('Duplicate delivery'), { code: 'P2002' });
      const row = {
        polarSyncedAt: null,
        polarAttempts: 0,
        polarNextAttemptAt: null,
        ...data,
      };
      this.state.deliveries.push(row);
      return row;
    },
    update: async ({ where, data }: Row) => {
      const row = this.state.deliveries.find((row) => row.id === where.id);
      if (!row) throw new Error('Missing delivery');
      Object.assign(row, data);
      return row;
    },
    updateMany: async ({ where, data }: Row) => {
      const rows = this.state.deliveries.filter(
        (row) =>
          row.id === where.id && row.polarSyncedAt === where.polarSyncedAt
      );
      for (const row of rows) Object.assign(row, data);
      return { count: rows.length };
    },
    findMany: async ({ where }: Row) =>
      this.state.deliveries.filter(
        (row) =>
          row.state === where.state &&
          row.polarSyncedAt === where.polarSyncedAt &&
          row.polarNextAttemptAt <= where.polarNextAttemptAt.lte
      ),
  };
  collideOnce = false;
  user = {
    findUnique: async ({ where }: Row) =>
      where.id === 'user-1' ? { id: 'user-1' } : null,
    findFirst: async ({ where }: Row) =>
      where.polarCustomerId === 'customer-1' ? { id: 'user-1' } : null,
    update: async () => ({ id: 'user-1' }),
  };
  subscription = {
    findFirst: async (_args: Row): Promise<Row | null> => null,
    findUnique: async ({ where }: Row) =>
      this.state.subscriptions.find((row) =>
        where.id
          ? row.id === where.id
          : row.polarSubscriptionId === where.polarSubscriptionId
      ) ?? null,
    upsert: async ({ where, create, update }: Row) => {
      let row = await this.subscription.findUnique({ where });
      if (!row) {
        const created: Row = {
          id: `local-${create.polarSubscriptionId}`,
          totalCredits: 0,
          usedCredits: 0,
          remainingCredits: 0,
          ...create,
        };
        this.state.subscriptions.push(created);
        row = created;
      } else Object.assign(row, update);
      return row;
    },
    update: async ({ where, data }: Row) => {
      const row = await this.subscription.findUnique({ where });
      if (!row) throw new Error('Subscription not found');
      increment(row, data);
      return row;
    },
  };
  order = {
    findUnique: async ({ where }: Row) =>
      this.state.orders.find(
        (row) => row.polarOrderId === where.polarOrderId
      ) ?? null,
    upsert: async ({ where, create, update }: Row) => {
      let row = await this.order.findUnique({ where });
      if (!row) {
        const created: Row = { id: `local-${create.polarOrderId}`, ...create };
        this.state.orders.push(created);
        row = created;
      } else Object.assign(row, update);
      return row;
    },
  };
  creditLedger = {
    findMany: async ({ where = {} }: Row = {}) =>
      this.state.ledger.filter(
        (row) =>
          (!where.referenceType || row.referenceType === where.referenceType) &&
          (!where.metadata || row.metadata.nextAttemptAt <= where.metadata.lte)
      ),
    groupBy: async ({ where }: Row) => {
      const groups = new Map<string | null, Row>();
      for (const row of this.state.ledger.filter(
        (row) => row.userId === where.userId
      )) {
        const key = row.subscriptionId ?? null;
        const group = groups.get(key) ?? {
          subscriptionId: key,
          _sum: { amount: 0 },
          _min: { createdAt: new Date(groups.size) },
        };
        group._sum.amount += row.amount;
        groups.set(key, group);
      }
      return [...groups.values()];
    },
    update: async ({ where, data }: Row) => {
      const row = await this.creditLedger.findUnique({ where });
      if (!row) throw new Error('Missing ledger entry');
      Object.assign(row, data);
      return row;
    },
    updateMany: async ({ where, data }: Row) => {
      const rows = this.state.ledger.filter(
        (row) =>
          row.id === where.id && row.referenceType === where.referenceType
      );
      for (const row of rows) Object.assign(row, data);
      return { count: rows.length };
    },
    findUnique: async ({ where }: Row) =>
      this.state.ledger.find(
        (row) =>
          row.referenceType === where.referenceType_referenceId.referenceType &&
          row.referenceId === where.referenceType_referenceId.referenceId
      ) ?? null,
    create: async ({ data }: Row) => {
      if (this.collideOnce) {
        this.collideOnce = false;
        throw Object.assign(new Error('Concurrent delivery'), {
          code: 'P2002',
        });
      }
      if (
        await this.creditLedger.findUnique({
          where: { referenceType_referenceId: data },
        })
      ) {
        throw Object.assign(new Error('Duplicate reference'), {
          code: 'P2002',
        });
      }
      const row = { id: `ledger-${this.state.ledger.length}`, ...data };
      this.state.ledger.push(row);
      return row;
    },
  };
  creditBalance = {
    findUnique: async ({ where }: Row) =>
      this.state.balances.find((row) => row.userId === where.userId) ?? null,
    update: async ({ where, data }: Row) => {
      if (this.failBalance) throw new Error('Database unavailable');
      const row = this.state.balances.find(
        (row) => row.userId === where.userId
      );
      if (!row) throw new Error('Missing balance');
      increment(row, data);
      return row;
    },
    upsert: async ({ where, create, update }: Row) => {
      if (this.failBalance) throw new Error('Database unavailable');
      let row = this.state.balances.find((row) => row.userId === where.userId);
      if (!row) {
        const created: Row = { ...create };
        this.state.balances.push(created);
        row = created;
      } else increment(row, update);
      return row;
    },
  };
  async $transaction(work: (tx: unknown) => Promise<unknown>) {
    const snapshot = structuredClone(this.state);
    try {
      return await work(this);
    } catch (error) {
      this.state = snapshot;
      throw error;
    }
  }
}

function increment(row: Row, changes: Row) {
  for (const [key, value] of Object.entries(changes)) {
    row[key] =
      value && typeof value === 'object' && 'increment' in value
        ? row[key] + value.increment
        : value && typeof value === 'object' && 'decrement' in value
          ? row[key] - value.decrement
          : value;
  }
}

function subscription(overrides: Row = {}) {
  return {
    id: 'subscription-1',
    status: 'active',
    productId: 'product-3000',
    customerId: 'customer-1',
    customer: { id: 'customer-1', externalId: 'user-1' },
    metadata: {},
    amount: 100,
    currentPeriodStart: new Date('2026-10-01T00:00:00Z'),
    currentPeriodEnd: new Date('2026-11-01T00:00:00Z'),
    canceledAt: null,
    ...overrides,
  } as Subscription;
}
function order(overrides: Row = {}) {
  return {
    id: 'order-1',
    status: 'paid',
    paid: true,
    refundedAmount: 0,
    createdAt: new Date('2026-10-01T00:00:01Z'),
    productId: 'product-3000',
    product: null,
    customerId: 'customer-1',
    customer: { id: 'customer-1', externalId: 'user-1' },
    metadata: {},
    totalAmount: 123,
    currency: 'usd',
    subscriptionId: 'subscription-1',
    subscription: subscription(),
    billingReason: 'subscription_create',
    ...overrides,
  } as unknown as Order;
}
function setup() {
  const db = new BillingDatabase();
  let lookups = 0;
  const service = createBillingWebhookService({
    db: db as unknown as typeof prisma,
    getSubscription: async () => {
      lookups++;
      return subscription();
    },
  });
  return { db, service, lookups: () => lookups };
}

test('a stored PAID order without an allocation is repaired exactly once', async () => {
  const { db, service } = setup();
  await service.syncSubscription(subscription());
  await service.syncOrder(order());
  assert.equal(db.state.orders[0].status, 'PAID');
  assert.equal(db.state.ledger.length, 0);
  await service.fulfillPaidOrder(order());
  await service.fulfillPaidOrder(order());
  assert.equal(db.state.ledger.length, 1);
  assert.equal(db.state.ledger[0].referenceType, 'ORDER');
  assert.equal(db.state.balances[0].totalCredits, 3000);
});

test('delayed initial payment after multiple renewals grants once, even after usage', async () => {
  const { db, service } = setup();
  await service.fulfillPaidOrder(
    order({ id: 'renewal-a', billingReason: 'subscription_cycle' })
  );
  await service.fulfillPaidOrder(
    order({ id: 'renewal-b', billingReason: 'subscription_cycle' })
  );
  const { createEmailCreditService } =
    await import('../lib/email-credit.service');
  await createEmailCreditService(db as unknown as typeof prisma).send(
    'user-1',
    'campaign',
    'one',
    'attempt',
    async () => ({ success: true })
  );
  await service.fulfillPaidOrder(order());
  await service.fulfillPaidOrder(order());
  assert.equal(db.state.balances[0].totalCredits, 9000);
  assert.equal(db.state.balances[0].remainingCredits, 8999);
});

test('accepted sends deduct once and track Polar sync on one delivery record', async () => {
  const { db, service } = setup();
  await service.fulfillPaidOrder(order());
  const { createEmailCreditService } =
    await import('../lib/email-credit.service');
  const credits = createEmailCreditService(db as unknown as typeof prisma);
  let calls = 0;
  const deliver = async () => {
    calls++;
    return { success: true, sesMessageId: 'ses-1' };
  };
  await credits.send('user-1', 'campaign', 'one', 'attempt-1', deliver);
  await credits.send('user-1', 'campaign', 'one', 'attempt-2', deliver);
  assert.equal(calls, 1);
  assert.equal(db.state.balances[0].remainingCredits, 2999);
  assert.equal(
    db.state.deliveries.filter((d) => d.state === 'sent' && !d.polarSyncedAt)
      .length,
    1
  );
  assert.equal(
    db.state.ledger.filter((l) => l.type === 'EMAIL_SENT').length,
    1
  );
  assert.equal(db.state.deliveries.length, 1);
  assert.equal(db.state.ledger.length, 2); // One purchase and one debit; no queue/marker ledger rows.
});

test('campaign SES transport never retries an ambiguous network failure internally', async () => {
  process.env.AWS_REGION = 'us-east-1';
  process.env.AWS_ACCESS_KEY_ID = 'test-only';
  process.env.AWS_SECRET_ACCESS_KEY = 'test-only';
  const { campaignSesClient, sendEmail } = await import('../lib/ses');
  const original = campaignSesClient.config.requestHandler;
  let requests = 0;
  campaignSesClient.config.requestHandler = {
    handle: async () => {
      requests++;
      throw Object.assign(new Error('Response lost'), { name: 'TimeoutError' });
    },
  };
  try {
    const response = await sendEmail({
      to: ['recipient@billing.test.invalid'],
      from: 'sender@billing.test.invalid',
      subject: 'Test',
      html: '<p>Test</p>',
      campaignId: 'campaign',
    });
    assert.equal(response.success, false);
    assert.equal(requests, 1);
  } finally {
    campaignSesClient.config.requestHandler = original;
  }
});

test('definitive rejection releases once, retry succeeds, and stale attempts cannot settle it', async () => {
  const { db, service } = setup();
  await service.fulfillPaidOrder(order());
  const { createEmailCreditService } =
    await import('../lib/email-credit.service');
  const credits = createEmailCreditService(db as unknown as typeof prisma);
  await credits.send('user-1', 'campaign', 'one', 'failed', async () => ({
    success: false,
    error: { code: 'TooManyRequestsException', message: 'throttled' },
  }));
  assert.equal(db.state.balances[0].remainingCredits, 3000);
  const previous = db.state.deliveries[0];
  const oldReservation = `${previous.id}:${previous.attemptId}`;
  await credits.settle('user-1', previous.id, oldReservation, 'failed');
  await credits.send('user-1', 'campaign', 'one', 'retry', async () => ({
    success: true,
  }));
  await assert.rejects(
    credits.settle('user-1', previous.id, oldReservation, 'failed'),
    /Stale/
  );
  assert.equal(db.state.balances[0].usedCredits, 1);
  assert.equal(
    db.state.deliveries.filter((d) => d.state === 'sent' && !d.polarSyncedAt)
      .length,
    1
  );
});

test('uncertain SES outcomes retain the debit and block resend; SES evidence settles it once', async () => {
  const { db, service } = setup();
  await service.fulfillPaidOrder(order());
  const { createEmailCreditService } =
    await import('../lib/email-credit.service');
  const credits = createEmailCreditService(db as unknown as typeof prisma);
  let calls = 0;
  await assert.rejects(
    credits.send('user-1', 'campaign', 'one', 'timeout', async () => {
      calls++;
      throw new Error('network timeout');
    }),
    /unresolved/
  );
  await assert.rejects(
    credits.send('user-1', 'campaign', 'one', 'retry', async () => {
      calls++;
      return { success: true };
    }),
    /unresolved/
  );
  assert.equal(calls, 1);
  const { recoverAcceptedEmail } =
    await import('../lib/settle-email-credit.mjs');
  const evidence = {
    campaignId: 'campaign',
    subscriberId: 'one',
    attemptId: 'timeout',
    sesMessageId: 'ses-recovered',
    timestamp: new Date().toISOString(),
  };
  await assert.rejects(
    recoverAcceptedEmail(db, { ...evidence, attemptId: 'another-attempt' }),
    /does not match/
  );
  await recoverAcceptedEmail(db, evidence);
  await recoverAcceptedEmail(db, evidence);
  assert.equal(db.state.balances[0].usedCredits, 1);
  assert.equal(
    db.state.deliveries.filter((d) => d.state === 'sent' && !d.polarSyncedAt)
      .length,
    1
  );
});

test('failure persisting send confirmation rolls back confirmation and SES evidence recovers without resend', async () => {
  const { db, service } = setup();
  await service.fulfillPaidOrder(order());
  const { createEmailCreditService } =
    await import('../lib/email-credit.service');
  const credits = createEmailCreditService(db as unknown as typeof prisma);
  const update = db.emailCreditDelivery.update;
  db.emailCreditDelivery.update = async (args: Row) => {
    if (args.data.state === 'sent')
      throw new Error('Database outage during confirmation');
    return update(args);
  };
  let calls = 0;
  await assert.rejects(
    credits.send('user-1', 'campaign', 'one', 'accepted', async () => {
      calls++;
      return { success: true };
    }),
    /unresolved/
  );
  assert.equal(db.state.deliveries[0].state, 'reserved');
  assert.equal(
    db.state.ledger.filter((l) => l.type === 'EMAIL_SENT').length,
    0
  );
  assert.equal(db.state.balances[0].usedCredits, 1);
  db.emailCreditDelivery.update = update;
  const { recoverAcceptedEmail } =
    await import('../lib/settle-email-credit.mjs');
  await recoverAcceptedEmail(db, {
    campaignId: 'campaign',
    subscriberId: 'one',
    attemptId: 'accepted',
    sesMessageId: 'ses-recovered',
    timestamp: new Date().toISOString(),
  });
  await credits.send('user-1', 'campaign', 'one', 'retry', async () => {
    calls++;
    return { success: true };
  });
  assert.equal(calls, 1);
  assert.equal(
    db.state.deliveries.filter((d) => d.state === 'sent' && !d.polarSyncedAt)
      .length,
    1
  );
});

test('revocation is atomic and preserves another subscription, including consumed credits', async () => {
  const { db, service } = setup();
  await service.fulfillPaidOrder(order());
  await service.fulfillPaidOrder(
    order({
      id: 'second-sub-order',
      subscriptionId: 'subscription-2',
      subscription: subscription({ id: 'subscription-2' }),
    })
  );
  db.failBalance = true;
  await assert.rejects(service.revokeSubscription(subscription()), /Database/);
  assert.equal(
    db.state.ledger.filter((l) => l.referenceType === 'SUBSCRIPTION_REVOKED')
      .length,
    0
  );
  assert.equal(db.state.subscriptions[0].status, 'ACTIVE');
  db.failBalance = false;
  await service.revokeSubscription(subscription());
  assert.equal(db.state.balances[0].remainingCredits, 3000);
  const { createEmailCreditService } =
    await import('../lib/email-credit.service');
  await createEmailCreditService(db as unknown as typeof prisma).send(
    'user-1',
    'campaign',
    'one',
    'attempt',
    async () => ({ success: true })
  );
  assert.equal(
    db.state.ledger.find((l) => l.type === 'EMAIL_SENT')!.subscriptionId,
    'local-subscription-2'
  );
});

test('reservation rollback prevents SES calls and missing or inconsistent balances fail closed', async () => {
  const { db, service } = setup();
  await service.fulfillPaidOrder(order());
  const { createEmailCreditService } =
    await import('../lib/email-credit.service');
  const credits = createEmailCreditService(db as unknown as typeof prisma);
  let calls = 0;
  const deliver = async () => {
    calls++;
    return { success: true };
  };
  db.failBalance = true;
  await assert.rejects(
    credits.send('user-1', 'campaign', 'one', 'attempt', deliver),
    /Database/
  );
  assert.equal(db.state.ledger.length, 1);
  db.failBalance = false;
  db.state.balances[0].remainingCredits = 5000;
  await assert.rejects(
    credits.send('user-1', 'campaign', 'one', 'attempt', deliver),
    /reconciliation/
  );
  db.state.balances = [];
  await assert.rejects(
    credits.send('user-1', 'campaign', 'one', 'attempt', deliver),
    /reconciliation/
  );
  assert.equal(calls, 0);
});

test('revocation removes only unused subscription credits and cannot be reversed by delayed orders', async () => {
  const { db, service } = setup();
  await service.fulfillPaidOrder(order());
  const { createEmailCreditService } =
    await import('../lib/email-credit.service');
  const credits = createEmailCreditService(db as unknown as typeof prisma);
  await credits.send('user-1', 'campaign', 'one', 'sent', async () => ({
    success: true,
  }));
  await service.fulfillPaidOrder(
    order({
      id: 'topup',
      subscriptionId: null,
      subscription: null,
      billingReason: 'purchase',
    })
  );
  await service.revokeSubscription(subscription());
  await service.revokeSubscription(subscription());
  assert.equal(db.state.balances[0].remainingCredits, 3000);
  assert.equal(db.state.balances[0].usedCredits, 1);
  await service.fulfillPaidOrder(
    order({ id: 'late-renewal', billingReason: 'subscription_cycle' })
  );
  assert.equal(db.state.balances[0].remainingCredits, 3000);
  assert.equal(db.state.subscriptions[0].remainingCredits, 0);
  await credits.send('user-1', 'campaign', 'two', 'topup-send', async () => ({
    success: true,
  }));
  assert.equal(db.state.balances[0].remainingCredits, 2999);
});

test('revoke-before-paid and rejected in-flight sends cannot restore revoked credits', async () => {
  const { db, service } = setup();
  await service.revokeSubscription(subscription());
  await service.fulfillPaidOrder(order());
  assert.equal(db.state.balances[0].remainingCredits, 0);
  const second = setup();
  await second.service.fulfillPaidOrder(order());
  const { createEmailCreditService } =
    await import('../lib/email-credit.service');
  const credits = createEmailCreditService(
    second.db as unknown as typeof prisma
  );
  const reserved = await credits.reserve(
    'user-1',
    'campaign',
    'one',
    'inflight'
  );
  assert.equal(reserved.outcome, 'reserved');
  if (reserved.outcome !== 'reserved') throw new Error('Expected reservation');
  await second.service.revokeSubscription(subscription());
  await credits.settle(
    'user-1',
    reserved.key,
    reserved.reservationId,
    'failed'
  );
  assert.equal(second.db.state.balances[0].remainingCredits, 0);
  assert.equal(second.db.state.balances[0].usedCredits, 0);
  assert.equal(second.db.state.balances[0].totalCredits, 0);
});

test('Polar sync retries lost responses using the same external ID without a second debit', async () => {
  const { db, service } = setup();
  await service.fulfillPaidOrder(order());
  const { createEmailCreditService } =
    await import('../lib/email-credit.service');
  await createEmailCreditService(db as unknown as typeof prisma).send(
    'user-1',
    'campaign',
    'one',
    'attempt',
    async () => ({ success: true })
  );
  const { syncPendingPolarUsage } =
    await import('../lib/polar/polar-usage-sync');
  const { polar } = await import('../lib/polar/polar-client');
  const ids: string[] = [];
  const client = {
    events: {
      ingest: async ({ events }: Row) => {
        assert.equal(events[0].name, 'SENT');
        assert.equal(events[0].metadata.emailsSent, 1);
        ids.push(events[0].externalId);
        if (ids.length === 1)
          throw new Error('Accepted remotely but response lost');
        return { inserted: 0, duplicates: 1 };
      },
    },
  } as unknown as typeof polar;
  await syncPendingPolarUsage(db as unknown as typeof prisma, client);
  const pending = db.state.deliveries[0];
  assert.equal(pending.polarAttempts, 1);
  pending.polarNextAttemptAt = new Date(0);
  await syncPendingPolarUsage(db as unknown as typeof prisma, client);
  await syncPendingPolarUsage(db as unknown as typeof prisma, client);
  assert.equal(ids.length, 2);
  assert.equal(ids[0], ids[1]);
  assert.equal(db.state.balances[0].usedCredits, 1);
  assert.equal(db.state.deliveries.filter((d) => d.polarSyncedAt).length, 1);
});

test('initial legacy allocation gets a zero-value order receipt without granting again', async () => {
  const { db, service } = setup();
  await service.syncSubscription(subscription());
  db.state.subscriptions[0].totalCredits = 3000;
  db.state.balances.push({
    userId: 'user-1',
    totalCredits: 3000,
    usedCredits: 100,
    remainingCredits: 2900,
  });
  db.state.ledger.push({
    id: 'old-allocation',
    userId: 'user-1',
    amount: 3000,
    referenceType: 'SUBSCRIPTION',
    referenceId: 'subscription-1',
  });
  await service.fulfillPaidOrder(order());
  await service.fulfillPaidOrder(order());
  assert.equal(db.state.balances[0].remainingCredits, 2900);
  assert.equal(db.state.ledger.length, 2);
  assert.equal(db.state.ledger[1].amount, 0);
  assert.equal(db.state.ledger[1].metadata.sourceLedgerId, 'old-allocation');
  await assert.rejects(
    service.fulfillPaidOrder(order({ id: 'another-order' })),
    /different order/
  );
});

test('legacy renewal keyed by order ID is recognized', async () => {
  const { db, service } = setup();
  await service.fulfillPaidOrder(order());
  db.state.ledger.push({
    id: 'old-renewal',
    userId: 'user-1',
    amount: 3000,
    referenceType: 'SUBSCRIPTION_RENEWAL',
    referenceId: 'renewal-order',
  });
  await service.fulfillPaidOrder(
    order({ id: 'renewal-order', billingReason: 'subscription_cycle' })
  );
  assert.equal(db.state.balances[0].totalCredits, 3000);
  assert.equal(db.state.ledger.at(-1)?.amount, 0);
});

test('mismatched legacy amounts and missing balances require review', async () => {
  const { db, service } = setup();
  await service.syncSubscription(subscription());
  db.state.balances.push({
    userId: 'user-1',
    totalCredits: 10000,
    usedCredits: 0,
    remainingCredits: 10000,
  });
  db.state.ledger.push({
    id: 'old-allocation',
    userId: 'user-1',
    amount: 10000,
    referenceType: 'SUBSCRIPTION',
    referenceId: 'subscription-1',
  });
  await assert.rejects(
    service.fulfillPaidOrder(order()),
    /differs from the purchased package/
  );
  db.state.ledger[0].amount = 3000;
  db.state.balances = [];
  await assert.rejects(service.fulfillPaidOrder(order()), /balance is missing/);
  assert.equal(db.state.orders.length, 0);
});

test('unpaid, refunded, prorated and inconsistent purchase kinds cannot grant packages', async () => {
  const { db, service } = setup();
  for (const changes of [
    { paid: false },
    { status: 'pending' },
    { refundedAmount: 1 },
    { billingReason: 'subscription_update' },
    { billingReason: 'purchase' },
  ]) {
    await assert.rejects(service.fulfillPaidOrder(order(changes)));
  }
  assert.equal(db.state.ledger.length, 0);
  await service.syncOrder(order({ status: 'refunded' }));
  await assert.rejects(service.fulfillPaidOrder(order()), /already refunded/);
  assert.equal(db.state.orders[0].status, 'REFUNDED');
});

test('a historical paid replay preserves canceled status and later subscription period', async () => {
  const { db, service } = setup();
  await service.fulfillPaidOrder(order());
  await service.syncSubscription(
    subscription({
      status: 'canceled',
      currentPeriodStart: new Date('2026-12-01T00:00:00Z'),
    })
  );
  await service.fulfillPaidOrder(order());
  assert.equal(db.state.subscriptions[0].status, 'CANCELED');
  assert.equal(
    db.state.subscriptions[0].currentPeriodStart.toISOString(),
    '2026-12-01T00:00:00.000Z'
  );
  assert.equal(db.state.balances[0].totalCredits, 3000);
});

test('duplicate product configuration and conflicting embedded IDs fail explicitly', async () => {
  const { buildProductCreditMapping, getCreditsPricing } =
    await import('../lib/polar/polar-client');
  assert.throws(
    () =>
      buildProductCreditMapping([
        ['same', 3000],
        ['same', 10000],
      ]),
    /Duplicate/
  );
  assert.throws(
    () =>
      getCreditsPricing({
        productId: 'product-3000',
        product: { id: 'product-10000' },
      }),
    /does not match/
  );
});

test('meter snapshots never double-charge local sends, including resets and delayed old snapshots', async () => {
  const { db, service } = setup();
  const { reconcileMeterUsage } = await import('../lib/credit-balance.service');
  const { createEmailCreditService } =
    await import('../lib/email-credit.service');
  const credits = createEmailCreditService(db as unknown as typeof prisma);
  await service.fulfillPaidOrder(order());
  await credits.send('user-1', 'campaign', 'one', 'a1', async () => ({
    success: true,
  }));
  for (const consumed of [1, 1, 0, 5000, 1]) {
    assert.equal(
      (
        await reconcileMeterUsage(
          'user-1',
          consumed,
          db as unknown as typeof prisma
        )
      ).outcome,
      'comparison_only'
    );
  }
  await credits.send('user-1', 'campaign', 'two', 'a2', async () => ({
    success: true,
  }));
  assert.equal(db.state.balances[0].usedCredits, 2);
  assert.equal(db.state.balances[0].remainingCredits, 2998);
  assert.equal(
    db.state.ledger.filter((l) => l.type === 'EMAIL_SENT').length,
    2
  );
  await assert.rejects(reconcileMeterUsage('user-1', -1), /Invalid/);
});

test('campaign and batch checks share the one-time purchase balance; meter refresh never replaces it', async () => {
  const { db, service } = setup();
  await service.fulfillPaidOrder(
    order({
      subscriptionId: null,
      subscription: null,
      billingReason: 'purchase',
    })
  );
  const shared = (globalThis as unknown as { prisma: Row }).prisma;
  Object.assign(shared, { ...db, $transaction: db.$transaction.bind(db) });
  db.subscription.findFirst = async () => null;
  (globalThis as unknown as { __redis: unknown }).__redis = {
    get: async () => null,
    set: async () => 'OK',
    del: async () => 0,
  };
  const { polar } = await import('../lib/polar/polar-client');
  const originalList = polar.customerMeters.list;
  polar.customerMeters.list = (async () =>
    (async function* () {
      yield {
        result: {
          items: [{ meterId: 'meter', creditedUnits: 0, consumedUnits: 50 }],
        },
      };
    })()) as unknown as typeof polar.customerMeters.list;
  try {
    const { EmailService } = await import('../lib/email-service');
    const { CreditService } = await import('../lib/credit-service');
    const { getUserCreditBalanceWithSync } =
      await import('../lib/polar/polar-meter.service');
    const refreshed = await getUserCreditBalanceWithSync('user-1', {
      syncFromPolar: true,
    });
    assert.equal(refreshed.hasActiveSubscription, false);
    assert.equal(refreshed.totalCredits, 3000);
    assert.equal(refreshed.remainingCredits, 3000);
    assert.equal(refreshed.polarComparison?.totalCredits, 0);
    assert.equal(
      (await EmailService.checkCreditsBeforeSending('user-1', 3000)).canSend,
      true
    );
    assert.equal(await CreditService.hasEnoughCredits('user-1', 3000), true);
    assert.equal(
      (await EmailService.checkCreditsBeforeSending('user-1', 3001)).canSend,
      false
    );
    assert.equal(await CreditService.hasEnoughCredits('user-1', 3001), false);
    db.state.balances = [];
    assert.equal(await CreditService.hasEnoughCredits('user-1', 1), false);
  } finally {
    polar.customerMeters.list = originalList;
    for (const key of Object.keys(shared)) delete shared[key];
  }
});

test('subscription lifecycle never grants credits; only paid order allocates without waiting for meters', async () => {
  const { db, service } = setup();
  await service.syncSubscription(subscription({ status: 'incomplete' }));
  assert.equal(db.state.subscriptions[0].status, 'INCOMPLETE');
  assert.equal(db.state.ledger.length, 0);
  await service.syncSubscription(subscription());
  assert.equal(db.state.subscriptions[0].status, 'ACTIVE');
  assert.equal(db.state.subscriptions[0].totalCredits, 0);
  assert.equal(db.state.ledger.length, 0);
  await service.fulfillPaidOrder(order());
  assert.equal(db.state.subscriptions[0].totalCredits, 3000);
  assert.equal(db.state.ledger.length, 1);
  assert.equal(db.state.balances[0].remainingCredits, 3000);
});

test('created, updated, active and paid deliveries allocate the initial package only once', async () => {
  const { db, service } = setup();
  await service.syncSubscription(subscription());
  await service.fulfillPaidOrder(order());
  await service.syncSubscription(subscription());
  await service.fulfillPaidOrder(order());
  assert.equal(db.state.ledger.length, 1);
  assert.equal(db.state.balances[0].totalCredits, 3000);
  assert.equal(db.state.orders[0].amount, 123);
});

test('paid can arrive first and recover an incomplete subscription; late creation cannot deactivate it', async () => {
  const { db, service } = setup();
  await service.fulfillPaidOrder(
    order({ subscription: subscription({ status: 'incomplete' }) })
  );
  await service.syncSubscription(subscription({ status: 'incomplete' }));
  await service.syncOrder(order({ status: 'pending' }));
  assert.equal(db.state.subscriptions[0].status, 'ACTIVE');
  assert.equal(db.state.orders[0].status, 'PAID');
  assert.equal(db.state.ledger.length, 1);
});

test('renewals grant a package per paid order even when the metered credit total resets', async () => {
  const { db, service } = setup();
  await service.fulfillPaidOrder(order());
  const renewal = order({
    id: 'renewal-1',
    billingReason: 'subscription_cycle',
  });
  await service.fulfillPaidOrder(renewal);
  await service.fulfillPaidOrder(renewal);
  await service.fulfillPaidOrder(
    order({ id: 'renewal-2', billingReason: 'subscription_cycle' })
  );
  assert.equal(db.state.ledger.length, 3);
  assert.equal(db.state.subscriptions[0].totalCredits, 9000);
  assert.equal(db.state.balances[0].totalCredits, 9000);
});

test('renewal replay respects a ledger reference created by the old handler', async () => {
  const { db, service } = setup();
  await service.fulfillPaidOrder(order());
  db.state.ledger.push({
    id: 'legacy-renewal',
    userId: 'user-1',
    amount: 3000,
    referenceType: 'SUBSCRIPTION_RENEWAL',
    referenceId: 'subscription-1-2026-10-01T00:00:00.000Z',
  });
  await service.fulfillPaidOrder(
    order({ id: 'legacy-renewal-order', billingReason: 'subscription_cycle' })
  );
  assert.equal(db.state.balances[0].totalCredits, 3000);
});

test('historical renewal cannot claim a legacy allocation from a later embedded period', async () => {
  const { db, service } = setup();
  await service.fulfillPaidOrder(order());
  db.state.ledger.push({
    id: 'later-legacy-renewal',
    userId: 'user-1',
    amount: 3000,
    referenceType: 'SUBSCRIPTION_RENEWAL',
    referenceId: 'subscription-1-2026-11-01T00:00:00.000Z',
  });
  await assert.rejects(
    service.fulfillPaidOrder(
      order({
        id: 'historical-renewal',
        billingReason: 'subscription_cycle',
        subscription: subscription({
          currentPeriodStart: new Date('2026-11-01T00:00:00Z'),
        }),
      })
    ),
    /Historical renewal period cannot be matched safely/
  );
  assert.equal(db.state.orders.length, 1);
  assert.equal(db.state.balances[0].totalCredits, 3000);
});

test('one-time paid purchases allocate credits without requiring a subscription or metadata userId', async () => {
  const { db, service } = setup();
  const purchase = order({
    subscriptionId: null,
    subscription: null,
    billingReason: 'purchase',
  });
  await service.fulfillPaidOrder(purchase);
  await service.fulfillPaidOrder(purchase);
  assert.equal(db.state.ledger.length, 1);
  assert.equal(db.state.balances[0].totalCredits, 3000);
  assert.equal(db.state.subscriptions.length, 0);
});

test('legacy meter snapshots without a ledger require reconciliation rather than duplicate credits', async () => {
  const { db, service } = setup();
  db.state.subscriptions.push({
    id: 'local-subscription-1',
    polarSubscriptionId: 'subscription-1',
    userId: 'user-1',
    status: 'ACTIVE',
    totalCredits: 3000,
    usedCredits: 100,
    remainingCredits: 2900,
  });
  db.state.balances.push({
    userId: 'user-1',
    totalCredits: 3000,
    usedCredits: 100,
    remainingCredits: 2900,
  });
  await assert.rejects(
    service.fulfillPaidOrder(order()),
    /reconcile before replaying/
  );
  assert.equal(db.state.balances[0].totalCredits, 3000);
  assert.equal(db.state.ledger.length, 0);
  assert.equal(db.state.orders.length, 0);
});

test('customer mapping falls back to the stored Polar customer ID', async () => {
  const { db, service } = setup();
  await service.syncSubscription(
    subscription({ customer: { id: 'customer-1', externalId: null } })
  );
  await service.fulfillPaidOrder(
    order({ customer: { id: 'customer-1', externalId: null } })
  );
  assert.equal(db.state.balances[0].userId, 'user-1');
});

test('failed balance writes roll back subscription, order and ledger, then succeed on retry', async () => {
  const { db, service } = setup();
  db.failBalance = true;
  await assert.rejects(
    service.fulfillPaidOrder(order()),
    /Database unavailable/
  );
  assert.equal(
    JSON.stringify(db.state),
    JSON.stringify({
      subscriptions: [],
      orders: [],
      ledger: [],
      balances: [],
      deliveries: [],
    })
  );
  db.failBalance = false;
  await service.fulfillPaidOrder(order());
  assert.equal(db.state.balances[0].totalCredits, 3000);
});

test('a concurrent unique conflict retries the transaction instead of losing the purchase', async () => {
  const { db, service } = setup();
  db.collideOnce = true;
  await service.fulfillPaidOrder(order());
  assert.equal(db.state.ledger.length, 1);
  assert.equal(db.state.balances[0].totalCredits, 3000);
});

test('unknown users and products fail without acknowledging or partially recording a purchase', async () => {
  const { db, service } = setup();
  await assert.rejects(
    service.fulfillPaidOrder(
      order({ customer: { id: 'customer-1', externalId: 'missing-user' } })
    ),
    /Cannot link/
  );
  await assert.rejects(
    service.fulfillPaidOrder(order({ productId: 'unknown-product' })),
    /No credit mapping/
  );
  assert.equal(db.state.orders.length, 0);
  assert.equal(db.state.ledger.length, 0);
});

test('missing embedded subscription is retrieved before opening the database transaction', async () => {
  const { db, service, lookups } = setup();
  await service.fulfillPaidOrder(order({ subscription: null }));
  assert.equal(lookups(), 1);
  assert.equal(db.state.ledger.length, 1);
});

test('verified webhook failures return HTTP 500 so Polar can retry; invalid signatures return 401', async () => {
  const { POST } = await import('../app/api/payments/webhooks/route');
  const { NextRequest } = await import('next/server');
  const payload = JSON.parse(
    readFileSync(
      new URL('../prisma/subscription-created.json', import.meta.url),
      'utf8'
    )
  );
  payload.data.recurring_interval_count = 1;
  payload.data.product.recurring_interval_count = 1;
  payload.data.product.prices = [];
  payload.data.product.benefits = [];
  payload.data.product.medias = [];
  payload.data.product.attached_custom_fields = [];
  payload.data.prices = [];
  const body = JSON.stringify(payload);
  const id = 'webhook-test-id';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const secret = 'billing-webhook-test-secret';
  process.env.POLAR_WEBHOOK_SECRET = secret;
  const signature = createHmac('sha256', secret)
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64');
  const headers = {
    'webhook-id': id,
    'webhook-timestamp': timestamp,
    'webhook-signature': `v1,${signature}`,
  };
  const original = billingWebhookService.syncSubscription;
  let verified = false;
  billingWebhookService.syncSubscription = async (data) => {
    verified = true;
    assert.ok(data.customer.externalId); // SDK converts signed snake_case payloads.
    throw new Error('Simulated Prisma P6008 outage');
  };
  try {
    const response = await POST(
      new NextRequest('http://localhost/api/payments/webhooks', {
        method: 'POST',
        body,
        headers,
      })
    );
    assert.equal(response.status, 500);
    assert.equal(verified, true);
    billingWebhookService.syncSubscription = async () => 'user-1';
    const success = await POST(
      new NextRequest('http://localhost/api/payments/webhooks', {
        method: 'POST',
        body,
        headers,
      })
    );
    assert.equal(success.status, 200);
    const invalid = await POST(
      new NextRequest('http://localhost/api/payments/webhooks', {
        method: 'POST',
        body,
        headers: { ...headers, 'webhook-signature': 'v1,invalid' },
      })
    );
    assert.equal(invalid.status, 401);
  } finally {
    billingWebhookService.syncSubscription = original;
  }
});
