import { createHash } from 'node:crypto';

// Shared with the standalone SES Lambda. Ship this file with that Lambda.
// Caller owns the serializable transaction. No network calls occur here.
export async function settleAcceptedEmail(
  tx,
  delivery,
  sesMessageId,
  acceptedAt = new Date()
) {
  if (delivery.state === 'sent') return;
  if (delivery.state !== 'reserved')
    throw new Error('Conflicting SES acceptance for released reservation');
  await tx.creditLedger.update({
    where: {
      referenceType_referenceId: {
        referenceType: 'EMAIL_RESERVATION',
        referenceId: `${delivery.id}:${delivery.attemptId}`,
      },
    },
    data: {
      type: 'EMAIL_SENT',
      metadata: {
        reason: 'ses_accepted_send',
        deliveryKey: delivery.id,
        sesMessageId: sesMessageId ?? null,
      },
    },
  });
  // This same durable delivery record now becomes eligible for Polar sync.
  await tx.emailCreditDelivery.update({
    where: { id: delivery.id },
    data: {
      state: 'sent',
      sesMessageId: sesMessageId ?? null,
      sentAt: acceptedAt,
      polarNextAttemptAt: acceptedAt,
    },
  });
}

export async function recoverAcceptedEmail(
  db,
  { campaignId, subscriberId, attemptId, sesMessageId, timestamp }
) {
  const key = createHash('sha256')
    .update(JSON.stringify([campaignId, subscriberId]))
    .digest('hex');
  for (let attempt = 0; ; attempt++) {
    try {
      await db.$transaction(
        async (tx) => {
          const delivery = await tx.emailCreditDelivery.findUnique({
            where: { id: key },
          });
          // Old sends, before the reservation flow, have nothing to settle.
          if (!delivery) return;
          if (delivery.attemptId !== attemptId)
            throw new Error(
              'SES event does not match current credit reservation'
            );
          await settleAcceptedEmail(
            tx,
            delivery,
            sesMessageId,
            timestamp ? new Date(timestamp) : new Date()
          );
        },
        { isolationLevel: 'Serializable', timeout: 15000 }
      );
      return;
    } catch (error) {
      if (attempt >= 3 || !['P2002', 'P2034'].includes(error.code)) throw error;
    }
  }
}
