import { prisma } from './prisma';

export async function readCreditBalance(userId: string, db = prisma) {
  const balance = await db.creditBalance.findUnique({ where: { userId } });
  return {
    totalCredits: balance?.totalCredits ?? 0,
    usedCredits: balance?.usedCredits ?? 0,
    remainingCredits: balance?.remainingCredits ?? 0,
    hasCreditBalance: Boolean(balance),
  };
}

// Local email reservations/debits are authoritative. Polar snapshots are
// comparison-only: they can lag, reset, overlap local sends or include usage
// from before migration. Never turn an aggregate counter into another debit.
export async function reconcileMeterUsage(
  _userId: string,
  consumed: number,
  _db = prisma
) {
  if (!Number.isSafeInteger(consumed) || consumed < 0)
    throw new Error('Invalid Polar consumption total');
  return { outcome: 'comparison_only' as const };
}
