-- AlterTable
ALTER TABLE "user" ADD COLUMN "suspended" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user" ADD COLUMN "suspendedAt" TIMESTAMP(3);
ALTER TABLE "user" ADD COLUMN "suspendedReason" TEXT;
