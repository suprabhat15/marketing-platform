CREATE TABLE "email_credit_delivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "campaignId" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "state" TEXT NOT NULL CHECK ("state" IN ('reserved', 'sent', 'failed')),
    "sesMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "polarSyncedAt" TIMESTAMP(3),
    "polarAttempts" INTEGER NOT NULL DEFAULT 0,
    "polarNextAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "email_credit_delivery_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "email_credit_delivery_state_polarSyncedAt_polarNextAttemptAt_idx"
    ON "email_credit_delivery"("state", "polarSyncedAt", "polarNextAttemptAt");
CREATE INDEX "email_credit_delivery_userId_idx" ON "email_credit_delivery"("userId");
