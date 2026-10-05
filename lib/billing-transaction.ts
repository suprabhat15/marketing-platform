import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';

// Serializable transactions protect the read/decision/write sequence, including
// two different orders trying to claim the same legacy allocation.
export async function billingTransaction<T>(
  db: typeof prisma,
  work: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(work, {
        isolationLevel: 'Serializable',
        maxWait: 5000,
        timeout: 15000,
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (attempt >= 3 || (code !== 'P2002' && code !== 'P2034')) throw error;
    }
  }
}
