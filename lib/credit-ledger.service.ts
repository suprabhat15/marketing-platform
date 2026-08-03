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
