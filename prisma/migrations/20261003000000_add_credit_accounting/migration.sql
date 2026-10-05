-- Credit accounting is already in schema.prisma but was missing from the
-- migration history. IF NOT EXISTS also supports databases initialized with
-- prisma db push before migrations were introduced.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'CreditTransactionType' AND n.nspname = current_schema()
    ) THEN
        CREATE TYPE "CreditTransactionType" AS ENUM (
            'CREDIT_ALLOCATION', 'EMAIL_SENT', 'EMAIL_BATCH', 'REFUND',
            'MANUAL_ADJUSTMENT', 'SUBSCRIPTION_RENEWAL'
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "credit_balance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalCredits" INTEGER NOT NULL DEFAULT 0,
    "usedCredits" INTEGER NOT NULL DEFAULT 0,
    "remainingCredits" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "credit_balance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "credit_ledger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "type" "CreditTransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "credit_ledger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "credit_balance_userId_key" ON "credit_balance"("userId");
CREATE INDEX IF NOT EXISTS "credit_ledger_userId_idx" ON "credit_ledger"("userId");
CREATE INDEX IF NOT EXISTS "credit_ledger_subscriptionId_idx" ON "credit_ledger"("subscriptionId");
CREATE UNIQUE INDEX IF NOT EXISTS "credit_ledger_referenceType_referenceId_key" ON "credit_ledger"("referenceType", "referenceId");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_balance_userId_fkey' AND conrelid = 'credit_balance'::regclass) THEN
        ALTER TABLE "credit_balance" ADD CONSTRAINT "credit_balance_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_ledger_userId_fkey' AND conrelid = 'credit_ledger'::regclass) THEN
        ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_ledger_subscriptionId_fkey' AND conrelid = 'credit_ledger'::regclass) THEN
        ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_subscriptionId_fkey"
            FOREIGN KEY ("subscriptionId") REFERENCES "subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
