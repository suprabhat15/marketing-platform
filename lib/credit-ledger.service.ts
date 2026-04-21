import { prisma } from '@/lib/prisma';
import type { CreditTransactionType } from '@prisma/client';

interface CreateLedgerEntryParams {
  userId: string;
  subscriptionId?: string;
  type: CreditTransactionType;
  amount: number; // Positive for credits, negative for deductions
  referenceType?: string;
  referenceId?: string;
  metadata?: Record<string, any>;
}

/**
 * Create a credit ledger entry with idempotency check.
 * Uses referenceType + referenceId as unique constraint to prevent duplicates.
 */
export async function createLedgerEntry(
  params: CreateLedgerEntryParams
): Promise<{ created: boolean; ledgerEntry: any }> {
  const {
    userId,
    subscriptionId,
    type,
    amount,
    referenceType,
    referenceId,
    metadata,
  } = params;

  try {
    // Check if entry already exists (idempotency)
    if (referenceType && referenceId) {
      const existing = await prisma.creditLedger.findUnique({
        where: {
          referenceType_referenceId: {
            referenceType,
            referenceId,
          },
        },
      });

      if (existing) {
        console.log(
          `⚠️ Ledger entry already exists for ${referenceType}:${referenceId}`
        );
        return { created: false, ledgerEntry: existing };
      }
    }

    // Create the ledger entry
    const ledgerEntry = await prisma.creditLedger.create({
      data: {
        userId,
        subscriptionId,
        type,
        amount,
        referenceType,
        referenceId,
        metadata: metadata || undefined,
      },
    });

    console.log(
      `✅ Created ledger entry: ${type} ${amount > 0 ? '+' : ''}${amount} credits for user ${userId}`
    );

    return { created: true, ledgerEntry };
  } catch (error: any) {
    // Handle unique constraint violation (race condition)
    if (error.code === 'P2002') {
      console.log(
        `⚠️ Ledger entry already exists (race condition) for ${referenceType}:${referenceId}`
      );
      const existing = await prisma.creditLedger.findUnique({
        where: {
          referenceType_referenceId: {
            referenceType: referenceType!,
            referenceId: referenceId!,
          },
        },
      });
      return { created: false, ledgerEntry: existing };
    }
    throw error;
  }
}

/**
 * Get or create a CreditBalance record for a user.
 * Initializes with provided values or zeros.
 */
export async function getOrCreateCreditBalance(
  userId: string,
  initialCredits: number = 0
): Promise<{
  id: string;
  userId: string;
  totalCredits: number;
  usedCredits: number;
  remainingCredits: number;
}> {
  // Try to find existing balance
  let balance = await prisma.creditBalance.findUnique({
    where: { userId },
  });

  if (!balance) {
    // Create new balance record
    balance = await prisma.creditBalance.create({
      data: {
        userId,
        totalCredits: initialCredits,
        usedCredits: 0,
        remainingCredits: initialCredits,
      },
    });
    console.log(
      `✅ Created CreditBalance for user ${userId} with ${initialCredits} credits`
    );
  }

  return balance;
}

/**
 * Atomically update credit balance.
 * @param userId - User ID
 * @param creditsDelta - Positive for adding credits, negative for deducting
 * @param isAllocation - If true, adds to totalCredits. If false, only updates usedCredits/remainingCredits
 */
export async function updateCreditBalance(
  userId: string,
  creditsDelta: number,
  isAllocation: boolean = false
): Promise<{
  totalCredits: number;
  usedCredits: number;
  remainingCredits: number;
}> {
  // Ensure balance exists
  await getOrCreateCreditBalance(userId);

  if (isAllocation) {
    // Adding new credits (subscription created/renewed)
    const updated = await prisma.creditBalance.update({
      where: { userId },
      data: {
        totalCredits: { increment: creditsDelta },
        remainingCredits: { increment: creditsDelta },
      },
    });
    return {
      totalCredits: updated.totalCredits,
      usedCredits: updated.usedCredits,
      remainingCredits: updated.remainingCredits,
    };
  } else {
    // Consuming credits (email sent)
    // creditsDelta is negative for consumption
    const creditsUsed = Math.abs(creditsDelta);
    const updated = await prisma.creditBalance.update({
      where: { userId },
      data: {
        usedCredits: { increment: creditsUsed },
        remainingCredits: { decrement: creditsUsed },
      },
    });
    return {
      totalCredits: updated.totalCredits,
      usedCredits: updated.usedCredits,
      remainingCredits: updated.remainingCredits,
    };
  }
}

/**
 * Get credit balance for fast reads.
 * Returns null if no balance exists.
 */
export async function getCreditBalance(userId: string) {
  return prisma.creditBalance.findUnique({
    where: { userId },
  });
}

/**
 * Get ledger entries for a user (audit trail).
 */
export async function getLedgerEntries(
  userId: string,
  options: {
    limit?: number;
    offset?: number;
    type?: CreditTransactionType;
  } = {}
) {
  const { limit = 50, offset = 0, type } = options;

  return prisma.creditLedger.findMany({
    where: {
      userId,
      ...(type && { type }),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  });
}
