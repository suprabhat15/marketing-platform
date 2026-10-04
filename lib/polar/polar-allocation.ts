import type { CreditLedger } from '@prisma/client';

export type PurchaseAllocationInput = {
  orderId: string;
  userId: string;
  credits: number;
  billingReason: string;
  polarSubscriptionId?: string | null;
  periodStart?: Date | null;
  subscriptionTotal: number;
  localSubscriptionId?: string;
  hasBalance: boolean;
};

export type AllocationDecision =
  | { outcome: 'allocate' }
  | { outcome: 'already_allocated' }
  | { outcome: 'legacy_accounted'; ledgerId: string }
  | { outcome: 'review_required'; reason: string };

// Shared by the webhook and read-only reconciliation. Legacy entries stay
// intact; a zero-amount ORDER receipt records which order claimed them.
export function decidePurchaseAllocation(
  purchase: PurchaseAllocationInput,
  ledger: CreditLedger[]
): AllocationDecision {
  const review = (reason: string): AllocationDecision => ({
    outcome: 'review_required',
    reason,
  });
  const metadata = (entry: CreditLedger) =>
    entry.metadata &&
    typeof entry.metadata === 'object' &&
    !Array.isArray(entry.metadata)
      ? entry.metadata
      : {};
  const existing = ledger.find(
    (l) => l.referenceType === 'ORDER' && l.referenceId === purchase.orderId
  );
  if (existing) {
    if (
      existing.userId !== purchase.userId ||
      (existing.amount !== purchase.credits &&
        !(
          existing.amount === 0 &&
          existing.type === 'MANUAL_ADJUSTMENT' &&
          metadata(existing).reason === 'legacy_purchase_receipt' &&
          typeof metadata(existing).sourceLedgerId === 'string' &&
          metadata(existing).allocatedCredits === purchase.credits
        ))
    ) {
      return review('Order allocation has a different owner or credit amount');
    }
    if (!purchase.hasBalance)
      return review('Allocation exists but the user balance is missing');
    return { outcome: 'already_allocated' };
  }

  const subscriptionId = purchase.polarSubscriptionId;
  const renewal = purchase.billingReason === 'subscription_cycle';
  const legacy = ledger.filter(
    (l) =>
      (l.referenceType === 'SUBSCRIPTION_RENEWAL' &&
        l.referenceId === purchase.orderId) ||
      (!renewal &&
        subscriptionId &&
        l.referenceType === 'SUBSCRIPTION' &&
        l.referenceId === subscriptionId) ||
      (renewal &&
        subscriptionId &&
        purchase.periodStart &&
        l.referenceType === 'SUBSCRIPTION_RENEWAL' &&
        l.referenceId ===
          `${subscriptionId}-${purchase.periodStart.toISOString()}`)
  );
  if (legacy.length > 1)
    return review(
      'Multiple legacy allocations could account for this purchase'
    );
  if (legacy.length === 1) {
    const entry = legacy[0];
    if (entry.userId !== purchase.userId || entry.amount !== purchase.credits) {
      return review(
        'Legacy allocation differs from the purchased package; reconcile before replaying'
      );
    }
    if (!purchase.hasBalance)
      return review('Legacy allocation exists but the user balance is missing');
    if (
      ledger.some(
        (l) =>
          l.referenceType === 'ORDER' && metadata(l).sourceLedgerId === entry.id
      )
    ) {
      return review(
        'Legacy allocation has already been attributed to a different order'
      );
    }
    return { outcome: 'legacy_accounted', ledgerId: entry.id };
  }
  if (!renewal && subscriptionId && purchase.subscriptionTotal > 0) {
    const accounted = ledger
      .filter(
        (entry) =>
          purchase.localSubscriptionId &&
          entry.subscriptionId === purchase.localSubscriptionId &&
          entry.referenceType === 'ORDER' &&
          ['CREDIT_ALLOCATION', 'SUBSCRIPTION_RENEWAL'].includes(entry.type) &&
          entry.amount > 0
      )
      .reduce((sum, entry) => sum + entry.amount, 0);
    if (accounted !== purchase.subscriptionTotal) {
      return review(
        'Subscription has credits without a matching allocation; reconcile before replaying'
      );
    }
  }
  const periodEntries = ledger.filter(
    (l) =>
      l.referenceType === 'SUBSCRIPTION_RENEWAL' &&
      subscriptionId &&
      l.referenceId?.startsWith(`${subscriptionId}-`)
  );
  if (
    renewal &&
    periodEntries.some(
      (l) =>
        !purchase.periodStart ||
        l.referenceId?.startsWith(`${subscriptionId}-total-`)
    )
  ) {
    return review(
      'Historical renewal period cannot be matched safely; reconcile before replaying'
    );
  }
  return { outcome: 'allocate' };
}
