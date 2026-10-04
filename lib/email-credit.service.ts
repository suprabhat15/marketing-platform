import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { billingTransaction } from './billing-transaction';
import { settleAcceptedEmail } from './settle-email-credit.mjs';

const reference = (referenceType: string, referenceId: string) => ({
  referenceType_referenceId: { referenceType, referenceId },
});

// All new debits carry the subscription they consume. Older, unattributed
// usage is assigned to the oldest subscription pool after exhausting top-ups.
// Aggregate in SQL; never fetch every per-email ledger row into the worker.
export async function availableCreditPools(
  tx: Prisma.TransactionClient,
  userId: string
) {
  const [balance, groups] = await Promise.all([
    tx.creditBalance.findUnique({ where: { userId } }),
    tx.creditLedger.groupBy({
      by: ['subscriptionId'],
      where: { userId },
      _sum: { amount: true },
      _min: { createdAt: true },
    }),
  ]);
  const net = groups.reduce((sum, group) => sum + (group._sum.amount ?? 0), 0);
  if (!balance || net !== balance.remainingCredits)
    throw new Error(
      'Credit accounting requires reconciliation before sending or revocation'
    );
  const pools = groups
    .map((group) => ({
      subscriptionId: group.subscriptionId,
      remaining: group._sum.amount ?? 0,
      createdAt: group._min.createdAt?.getTime() ?? 0,
    }))
    .sort(
      (a, b) =>
        a.createdAt - b.createdAt ||
        (a.subscriptionId ?? '').localeCompare(b.subscriptionId ?? '')
    );
  let debt = 0;
  for (const pool of pools) {
    if (pool.remaining < 0) {
      debt -= pool.remaining;
      pool.remaining = 0;
    }
  }
  for (const pool of pools) {
    const applied = Math.min(debt, pool.remaining);
    pool.remaining -= applied;
    debt -= applied;
  }
  return { balance, pools };
}

export class EmailCreditPendingError extends Error {
  constructor() {
    super(
      'Email delivery has an unresolved credit reservation; reconcile SES outcome before retrying'
    );
  }
}

export function createEmailCreditService(db = prisma) {
  const deliveryKey = (campaignId: string, subscriberId: string) =>
    createHash('sha256')
      .update(JSON.stringify([campaignId, subscriberId]))
      .digest('hex');

  async function reserve(
    userId: string,
    campaignId: string,
    subscriberId: string,
    attemptId: string
  ) {
    const key = deliveryKey(campaignId, subscriberId);
    return billingTransaction(db, async (tx) => {
      const where = { id: key };
      const delivery = await tx.emailCreditDelivery.findUnique({ where });
      if (delivery && delivery.userId !== userId)
        throw new Error('Email delivery owner mismatch');
      if (delivery?.state === 'sent')
        return { outcome: 'already_sent' as const, key };
      if (delivery && delivery.state !== 'failed')
        throw new EmailCreditPendingError();
      const { balance, pools } = await availableCreditPools(tx, userId);
      if (balance.remainingCredits < 1)
        throw new Error('Insufficient credits for email send');
      const pool = pools.find((pool) => pool.remaining > 0);
      if (!pool) throw new Error('No spendable credit pool');
      const reservationId = `${key}:${attemptId}`;
      const entry = {
        id: key,
        userId,
        subscriptionId: pool.subscriptionId,
        state: 'reserved',
        campaignId,
        subscriberId,
        attemptId,
      };
      if (delivery)
        await tx.emailCreditDelivery.update({
          where,
          data: {
            state: 'reserved',
            attemptId,
            subscriptionId: pool.subscriptionId,
          },
        });
      else await tx.emailCreditDelivery.create({ data: entry });
      await tx.creditLedger.create({
        data: {
          userId,
          subscriptionId: pool.subscriptionId,
          type: 'MANUAL_ADJUSTMENT',
          amount: -1,
          referenceType: 'EMAIL_RESERVATION',
          referenceId: reservationId,
          metadata: { reason: 'email_send_reservation', deliveryKey: key },
        },
      });
      await tx.creditBalance.update({
        where: { userId },
        data: {
          usedCredits: { increment: 1 },
          remainingCredits: { decrement: 1 },
        },
      });
      return { outcome: 'reserved' as const, key, reservationId };
    });
  }

  async function settle(
    userId: string,
    key: string,
    reservationId: string,
    outcome: 'sent' | 'failed',
    sesMessageId?: string
  ) {
    return billingTransaction(db, async (tx) => {
      const where = { id: key };
      const delivery = await tx.emailCreditDelivery.findUnique({ where });
      if (!delivery || delivery.userId !== userId)
        throw new Error('Email delivery not found for user');
      if (`${delivery.id}:${delivery.attemptId}` !== reservationId)
        throw new Error(
          'Stale email attempt cannot settle another reservation'
        );
      if (delivery.state === outcome) return;
      if (delivery.state !== 'reserved')
        throw new Error('Conflicting email delivery outcome');
      if (outcome === 'failed') {
        const revoked = delivery.subscriptionId
          ? await tx.creditLedger.findUnique({
              where: reference('SUBSCRIPTION_REVOKED', delivery.subscriptionId),
            })
          : null;
        // A failed in-flight send must not resurrect an already revoked grant.
        await tx.creditLedger.create({
          data: {
            userId,
            subscriptionId: delivery.subscriptionId,
            type: 'REFUND',
            amount: revoked ? 0 : 1,
            referenceType: 'EMAIL_RELEASE',
            referenceId: reservationId,
            metadata: {
              reason: revoked
                ? 'failed_send_after_revocation'
                : 'ses_rejected_send',
            },
          },
        });
        await tx.creditBalance.update({
          where: { userId },
          data: {
            usedCredits: { decrement: 1 },
            ...(revoked
              ? { totalCredits: { decrement: 1 } }
              : { remainingCredits: { increment: 1 } }),
          },
        });
      } else {
        await settleAcceptedEmail(tx, delivery, sesMessageId);
        return;
      }
      await tx.emailCreditDelivery.update({
        where,
        data: {
          state: outcome,
          sesMessageId: sesMessageId ?? null,
        },
      });
    });
  }
  async function send(
    userId: string,
    campaignId: string,
    subscriberId: string,
    attemptId: string,
    deliver: () => Promise<{
      success: boolean;
      sesMessageId?: string;
      error?: { code: string; message: string };
    }>
  ) {
    const reservation = await reserve(
      userId,
      campaignId,
      subscriberId,
      attemptId
    );
    if (reservation.outcome === 'already_sent')
      return { success: true, alreadySent: true };
    try {
      const result = await deliver();
      if (result.success) {
        await settle(
          userId,
          reservation.key,
          reservation.reservationId,
          'sent',
          result.sesMessageId
        );
      } else if (result.error && isDefinitiveSesRejection(result.error.code)) {
        await settle(
          userId,
          reservation.key,
          reservation.reservationId,
          'failed'
        );
      } else {
        throw new EmailCreditPendingError();
      }
      return { ...result, alreadySent: false };
    } catch (error) {
      // Neither a transport failure nor a database failure after SES acceptance
      // proves the email was not sent. Keep the debit and stop resend attempts.
      console.error('Email reservation requires outcome reconciliation', {
        key: reservation.key,
        reservationId: reservation.reservationId,
      });
      throw new EmailCreditPendingError();
    }
  }
  return { reserve, settle, send };
}

// Only explicit SES rejections prove that no email was accepted. Transport
// errors, 5xx responses and timeouts retain the reservation for investigation.
export function isDefinitiveSesRejection(code: string) {
  return new Set([
    'MessageRejected',
    'MessageRejectedException',
    'BadRequestException',
    'MailFromDomainNotVerifiedException',
    'NotFoundException',
    'AccountSuspendedException',
    'SendingPausedException',
    'TooManyRequestsException',
    'LimitExceededException',
    'AccessDeniedException',
    'UnrecognizedClientException',
    'InvalidClientTokenId',
  ]).has(code);
}

export const emailCreditService = createEmailCreditService();
