import type { Prisma, SubscriptionStatus, OrderStatus } from '@prisma/client';
import type { Order } from '@polar-sh/sdk/models/components/order';
import { prisma } from '@/lib/prisma';
import { getCreditsPricing, polar } from './polar-client';
import { billingTransaction } from '../billing-transaction';
import { decidePurchaseAllocation } from './polar-allocation';
import { availableCreditPools } from '../email-credit.service';

type SubscriptionData = {
  id: string;
  status: string;
  customerId: string;
  productId: string;
  customer: {
    id: string;
    externalId?: string | null;
    metadata?: Record<string, string | number | boolean>;
  };
  metadata?: Record<string, string | number | boolean>;
  amount?: number;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  canceledAt?: Date | null;
};

const subscriptionStatuses: Record<string, SubscriptionStatus> = {
  active: 'ACTIVE',
  canceled: 'CANCELED',
  past_due: 'PAST_DUE',
  unpaid: 'UNPAID',
  incomplete: 'INCOMPLETE',
  incomplete_expired: 'CANCELED',
  trialing: 'INCOMPLETE',
};

export function createBillingWebhookService({
  db = prisma,
  getSubscription = (id: string) => polar.subscriptions.get({ id }),
} = {}) {
  async function resolveUserId(data: {
    customerId: string;
    customer?: SubscriptionData['customer'];
    metadata?: SubscriptionData['metadata'];
  }) {
    const externalId = data.customer?.externalId;
    const metadataId = data.metadata?.userId || data.customer?.metadata?.userId;
    const candidate =
      externalId || (typeof metadataId === 'string' ? metadataId : undefined);
    const user = candidate
      ? await db.user.findUnique({
          where: { id: candidate },
          select: { id: true },
        })
      : await db.user.findFirst({
          where: { polarCustomerId: data.customerId },
          select: { id: true },
        });

    if (!user) {
      throw new Error(
        `Cannot link Polar customer ${data.customerId} to a local user`
      );
    }
    return user.id;
  }

  async function transaction<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    return billingTransaction(db, work);
  }

  async function allocate(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: number,
    referenceType: string,
    referenceId: string,
    subscriptionId?: string,
    renewal = false,
    revoked = false
  ) {
    const existing = await tx.creditLedger.findUnique({
      where: { referenceType_referenceId: { referenceType, referenceId } },
    });
    if (existing) return;

    await tx.creditLedger.create({
      data: {
        userId,
        subscriptionId,
        type: renewal ? 'SUBSCRIPTION_RENEWAL' : 'CREDIT_ALLOCATION',
        amount,
        referenceType,
        referenceId,
      },
    });
    await tx.creditBalance.upsert({
      where: { userId },
      create: {
        userId,
        totalCredits: revoked ? 0 : amount,
        usedCredits: 0,
        remainingCredits: revoked ? 0 : amount,
      },
      update: {
        totalCredits: { increment: revoked ? 0 : amount },
        remainingCredits: { increment: revoked ? 0 : amount },
      },
    });
    if (subscriptionId) {
      await tx.subscription.update({
        where: { id: subscriptionId },
        data: {
          totalCredits: { increment: amount },
          remainingCredits: { increment: revoked ? 0 : amount },
        },
      });
    }
    if (revoked)
      await tx.creditLedger.create({
        data: {
          userId,
          subscriptionId,
          type: 'MANUAL_ADJUSTMENT',
          amount: -amount,
          referenceType: 'REVOKED_ORDER',
          referenceId,
          metadata: { reason: 'paid_order_for_revoked_subscription' },
        },
      });
  }

  async function saveSubscription(
    tx: Prisma.TransactionClient,
    data: SubscriptionData,
    userId: string,
    fromPaidOrder = false
  ) {
    let status = subscriptionStatuses[data.status];
    if (!status)
      throw new Error(`Unsupported Polar subscription status: ${data.status}`);
    const previous = await tx.subscription.findUnique({
      where: { polarSubscriptionId: data.id },
    });
    // Creation can arrive after activation. An incomplete checkout snapshot
    // must not deactivate a subscription that has already been paid/activated.
    if (status === 'INCOMPLETE' && previous?.status === 'ACTIVE')
      status = 'ACTIVE';
    const { credits } = getCreditsPricing(data);
    const fields = {
      customerId: data.customerId,
      productId: data.productId,
      status,
      credits,
      amount: data.amount ?? 0,
      currentPeriodStart: data.currentPeriodStart,
      currentPeriodEnd: data.currentPeriodEnd,
      canceledAt: data.canceledAt,
    };
    const subscription = await tx.subscription.upsert({
      where: { polarSubscriptionId: data.id },
      create: { ...fields, polarSubscriptionId: data.id, userId },
      // A historical paid-order replay must not reactivate a canceled
      // subscription or move its current billing period backwards.
      update:
        fromPaidOrder && previous
          ? previous.status === 'INCOMPLETE' && status === 'ACTIVE'
            ? { status }
            : {}
          : fields,
    });
    if (subscription.userId !== userId) {
      throw new Error(
        `Subscription ${data.id} belongs to a different local user`
      );
    }
    await tx.user.update({
      where: { id: userId },
      data: { polarCustomerId: data.customerId },
    });
    return subscription;
  }

  async function syncSubscription(data: SubscriptionData) {
    const userId = await resolveUserId(data);
    await transaction((tx) => saveSubscription(tx, data, userId));
    return userId;
  }

  async function revokeSubscription(data: SubscriptionData) {
    const userId = await resolveUserId(data);
    await transaction(async (tx) => {
      const subscription = await saveSubscription(
        tx,
        { ...data, status: 'canceled' },
        userId
      );
      const where = {
        referenceType_referenceId: {
          referenceType: 'SUBSCRIPTION_REVOKED',
          referenceId: subscription.id,
        },
      };
      const existing = await tx.creditLedger.findUnique({ where });
      if (!existing) {
        const balance = await tx.creditBalance.findUnique({
          where: { userId },
        });
        let amount = 0;
        if (balance) {
          const { pools } = await availableCreditPools(tx, userId);
          amount =
            pools.find((pool) => pool.subscriptionId === subscription.id)
              ?.remaining ?? 0;
        } else if (subscription.totalCredits > 0) {
          throw new Error(
            'Revocation requires reconciliation of missing credit balance'
          );
        }
        await tx.creditLedger.create({
          data: {
            userId,
            subscriptionId: subscription.id,
            type: 'MANUAL_ADJUSTMENT',
            amount: -amount,
            referenceType: 'SUBSCRIPTION_REVOKED',
            referenceId: subscription.id,
            metadata: { reason: 'subscription_revoked' },
          },
        });
        if (amount)
          await tx.creditBalance.update({
            where: { userId },
            data: {
              totalCredits: { decrement: amount },
              remainingCredits: { decrement: amount },
            },
          });
      }
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'CANCELED',
          remainingCredits: 0,
          canceledAt: data.canceledAt ?? new Date(),
        },
      });
    });
    return userId;
  }

  async function saveOrder(
    tx: Prisma.TransactionClient,
    data: Order,
    userId: string
  ) {
    const productId = data.productId || data.product?.id;
    if (!productId) throw new Error(`Order ${data.id} has no product ID`);
    const { credits } = getCreditsPricing(data);
    const statuses: Record<string, OrderStatus> = {
      pending: 'PENDING',
      paid: 'PAID',
      refunded: 'REFUNDED',
      partially_refunded: 'PAID',
    };
    let status = statuses[data.status];
    if (!status)
      throw new Error(`Unsupported Polar order status: ${data.status}`);
    const previous = await tx.order.findUnique({
      where: { polarOrderId: data.id },
    });
    if (previous && previous.userId !== userId) {
      throw new Error(`Order ${data.id} belongs to a different local user`);
    }
    if (previous?.status === 'REFUNDED' || (status === 'PENDING' && previous))
      status = previous.status;
    const fields = {
      customerId: data.customerId,
      productId,
      amount: data.totalAmount,
      currency: data.currency.toUpperCase(),
      status,
      credits,
    };
    return tx.order.upsert({
      where: { polarOrderId: data.id },
      create: { ...fields, polarOrderId: data.id, userId },
      update: fields,
    });
  }

  async function syncOrder(data: Order) {
    const userId = await resolveUserId(data);
    await transaction((tx) => saveOrder(tx, data, userId));
    return userId;
  }

  async function fulfillPaidOrder(data: Order) {
    if (!data.paid || data.status !== 'paid' || data.refundedAmount > 0) {
      throw new Error(`Order ${data.id} is not an unrefunded paid purchase`);
    }
    const expectedReason = data.subscriptionId
      ? ['subscription_create', 'subscription_cycle']
      : ['purchase'];
    if (!expectedReason.includes(data.billingReason)) {
      throw new Error(
        `Unsupported credit purchase billing reason: ${data.billingReason}`
      );
    }
    const userId = await resolveUserId(data);
    const productId = data.productId || data.product?.id;
    if (!productId) throw new Error(`Order ${data.id} has no product ID`);
    const { credits } = getCreditsPricing(data);
    // Order embeds its subscription snapshot. Use that period for renewals,
    // even when a historical delivery is replayed after a later billing cycle.
    const subscriptionData: SubscriptionData | null = data.subscriptionId
      ? data.subscription
        ? {
            ...data.subscription,
            customerId: data.customerId,
            customer: data.customer,
            productId,
          }
        : await getSubscription(data.subscriptionId)
      : null;

    if (
      subscriptionData &&
      (subscriptionData.id !== data.subscriptionId ||
        subscriptionData.customerId !== data.customerId)
    ) {
      throw new Error(`Order ${data.id} subscription/customer mismatch`);
    }
    const outcome = await transaction(async (tx) => {
      const savedOrder = await saveOrder(tx, data, userId);
      if (savedOrder.status === 'REFUNDED')
        throw new Error(`Order ${data.id} was already refunded`);
      const renewal = data.billingReason === 'subscription_cycle';
      const paidSubscription = subscriptionData
        ? {
            ...subscriptionData,
            status:
              subscriptionData.status === 'incomplete'
                ? 'active'
                : subscriptionData.status,
          }
        : null;
      const subscription = paidSubscription
        ? await saveSubscription(tx, paidSubscription, userId, true)
        : null;
      const [ledger, balance] = await Promise.all([
        tx.creditLedger.findMany({
          where: {
            OR: [
              {
                userId,
                referenceType: {
                  in: ['ORDER', 'SUBSCRIPTION', 'SUBSCRIPTION_RENEWAL'],
                },
              },
              { referenceType: 'ORDER', referenceId: data.id },
            ],
          },
        }),
        tx.creditBalance.findUnique({ where: { userId } }),
      ]);
      const decision = decidePurchaseAllocation(
        {
          orderId: data.id,
          userId,
          credits,
          billingReason: data.billingReason,
          polarSubscriptionId: data.subscriptionId,
          // A fetched subscription can be in a later period than a historical
          // order. Only the event's embedded period can match legacy renewals.
          periodStart:
            data.subscription?.currentPeriodStart &&
            data.subscription.currentPeriodStart <= data.createdAt
              ? data.subscription.currentPeriodStart
              : null,
          subscriptionTotal: subscription?.totalCredits ?? 0,
          localSubscriptionId: subscription?.id,
          hasBalance: Boolean(balance),
        },
        ledger
      );
      if (decision.outcome === 'review_required')
        throw new Error(`Order ${data.id}: ${decision.reason}`);
      if (decision.outcome === 'legacy_accounted') {
        await tx.creditLedger.create({
          data: {
            userId,
            subscriptionId: subscription?.id,
            type: 'MANUAL_ADJUSTMENT',
            amount: 0,
            referenceType: 'ORDER',
            referenceId: data.id,
            metadata: {
              sourceLedgerId: decision.ledgerId,
              allocatedCredits: credits,
              reason: 'legacy_purchase_receipt',
            },
          },
        });
      } else if (decision.outcome === 'allocate') {
        const revoked = subscription
          ? await tx.creditLedger.findUnique({
              where: {
                referenceType_referenceId: {
                  referenceType: 'SUBSCRIPTION_REVOKED',
                  referenceId: subscription.id,
                },
              },
            })
          : null;
        await allocate(
          tx,
          userId,
          credits,
          'ORDER',
          data.id,
          subscription?.id,
          renewal,
          Boolean(revoked)
        );
      }
      return decision.outcome;
    });
    console.info('Purchase credit allocation', {
      orderId: data.id,
      userId,
      credits,
      outcome,
    });
    return userId;
  }

  return { syncSubscription, syncOrder, fulfillPaidOrder, revokeSubscription };
}

export const billingWebhookService = createBillingWebhookService();
