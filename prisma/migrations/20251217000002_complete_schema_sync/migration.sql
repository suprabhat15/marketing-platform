-- Complete schema migration to match current prisma/schema.prisma
-- This ensures all tables and fields are properly created

-- CreateEnum (if not exists)
DO $$ BEGIN
    CREATE TYPE "public"."CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'QUEUED', 'SENDING', 'SENT', 'COMPLETED', 'CANCELLED', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "public"."DomainStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "public"."EventType" AS ENUM ('SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'COMPLAINED', 'FAILED', 'SUPPRESSED', 'UNSUBSCRIBED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "public"."OrderStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "public"."SubscriberStatus" AS ENUM ('ACTIVE', 'UNSUBSCRIBED', 'BOUNCED', 'COMPLAINED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "public"."SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELED', 'PAST_DUE', 'UNPAID', 'INCOMPLETE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable User (update existing or create)
CREATE TABLE IF NOT EXISTS "public"."user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "polarCustomerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- Add missing columns to user table
ALTER TABLE "public"."user" ADD COLUMN IF NOT EXISTS "polarCustomerId" TEXT;

-- CreateTable List (update existing or create)
CREATE TABLE IF NOT EXISTS "public"."list" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "list_pkey" PRIMARY KEY ("id")
);

-- CreateTable Subscriber (update existing or create)
CREATE TABLE IF NOT EXISTS "public"."subscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "status" "public"."SubscriberStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "listId" TEXT NOT NULL,

    CONSTRAINT "subscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable Campaign (update existing or create)
CREATE TABLE IF NOT EXISTS "public"."campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "public"."CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "queuedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "subscriberIds" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "templateId" TEXT,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "replyTo" TEXT,

    CONSTRAINT "campaign_pkey" PRIMARY KEY ("id")
);

-- Add missing columns to campaign table
ALTER TABLE "public"."campaign" ADD COLUMN IF NOT EXISTS "queuedAt" TIMESTAMP(3);
ALTER TABLE "public"."campaign" ADD COLUMN IF NOT EXISTS "fromEmail" TEXT;
ALTER TABLE "public"."campaign" ADD COLUMN IF NOT EXISTS "fromName" TEXT;
ALTER TABLE "public"."campaign" ADD COLUMN IF NOT EXISTS "replyTo" TEXT;

-- Update fromEmail to NOT NULL with default for existing records
UPDATE "public"."campaign" SET "fromEmail" = 'noreply@example.com' WHERE "fromEmail" IS NULL;
ALTER TABLE "public"."campaign" ALTER COLUMN "fromEmail" SET NOT NULL;

-- CreateTable CampaignStats
CREATE TABLE IF NOT EXISTS "public"."campaign_stats" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "delivered" INTEGER NOT NULL DEFAULT 0,
    "opened" INTEGER NOT NULL DEFAULT 0,
    "clicked" INTEGER NOT NULL DEFAULT 0,
    "bounced" INTEGER NOT NULL DEFAULT 0,
    "complained" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "suppressed" INTEGER NOT NULL DEFAULT 0,
    "unsubscribed" INTEGER NOT NULL DEFAULT 0,
    "totalEvents" INTEGER NOT NULL DEFAULT 0,
    "lastSyncAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable Template (update existing or create)
CREATE TABLE IF NOT EXISTS "public"."template" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "html" TEXT,
    "attachments" JSONB DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "template_pkey" PRIMARY KEY ("id")
);

-- CreateTable Event (update existing or create)
CREATE TABLE IF NOT EXISTS "public"."event" (
    "id" TEXT NOT NULL,
    "type" "public"."EventType" NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subscriberId" TEXT,
    "campaignId" TEXT,

    CONSTRAINT "event_pkey" PRIMARY KEY ("id")
);

-- CreateTable Domain
CREATE TABLE IF NOT EXISTS "public"."domain" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "status" "public"."DomainStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "txtRecord" TEXT,
    "mxRecord" TEXT,
    "cnameKey1" TEXT,
    "cnameValue1" TEXT,
    "cnameKey2" TEXT,
    "cnameValue2" TEXT,
    "cnameKey3" TEXT,
    "cnameValue3" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "domain_pkey" PRIMARY KEY ("id")
);

-- CreateTable Session (Better Auth)
CREATE TABLE IF NOT EXISTS "public"."session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable Account (Better Auth)
CREATE TABLE IF NOT EXISTS "public"."account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "idToken" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable VerificationToken (Better Auth)
CREATE TABLE IF NOT EXISTS "public"."verification_token" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable Verification (Better Auth)
CREATE TABLE IF NOT EXISTS "public"."verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable Subscription (Polar Integration)
CREATE TABLE IF NOT EXISTS "public"."subscription" (
    "id" TEXT NOT NULL,
    "polarSubscriptionId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "priceId" TEXT,
    "status" "public"."SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "credits" INTEGER NOT NULL DEFAULT 0,
    "totalCredits" INTEGER NOT NULL DEFAULT 0,
    "usedCredits" INTEGER NOT NULL DEFAULT 0,
    "remainingCredits" INTEGER NOT NULL DEFAULT 0,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "meterId" TEXT,
    "meterName" TEXT DEFAULT 'credits',
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);

-- Add new columns to existing subscription table
ALTER TABLE "public"."subscription" ADD COLUMN IF NOT EXISTS "priceId" TEXT;
ALTER TABLE "public"."subscription" ADD COLUMN IF NOT EXISTS "credits" INTEGER DEFAULT 0;
ALTER TABLE "public"."subscription" ADD COLUMN IF NOT EXISTS "amount" DOUBLE PRECISION DEFAULT 0;

-- Update credits column to NOT NULL
UPDATE "public"."subscription" SET "credits" = 0 WHERE "credits" IS NULL;
ALTER TABLE "public"."subscription" ALTER COLUMN "credits" SET NOT NULL;
ALTER TABLE "public"."subscription" ALTER COLUMN "credits" SET DEFAULT 0;

-- Update amount column to NOT NULL  
UPDATE "public"."subscription" SET "amount" = 0 WHERE "amount" IS NULL;
ALTER TABLE "public"."subscription" ALTER COLUMN "amount" SET NOT NULL;
ALTER TABLE "public"."subscription" ALTER COLUMN "amount" SET DEFAULT 0;

-- CreateTable Order (Polar Integration)
CREATE TABLE IF NOT EXISTS "public"."order" (
    "id" TEXT NOT NULL,
    "polarOrderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "public"."OrderStatus" NOT NULL DEFAULT 'PENDING',
    "credits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (create only if not exists)
CREATE UNIQUE INDEX IF NOT EXISTS "user_email_key" ON "public"."user"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "user_polarCustomerId_key" ON "public"."user"("polarCustomerId");

CREATE UNIQUE INDEX IF NOT EXISTS "subscriber_email_listId_key" ON "public"."subscriber"("email", "listId");

CREATE UNIQUE INDEX IF NOT EXISTS "campaign_stats_campaignId_key" ON "public"."campaign_stats"("campaignId");

CREATE UNIQUE INDEX IF NOT EXISTS "event_subscriberId_campaignId_type_data_key" ON "public"."event"("subscriberId", "campaignId", "type", "data");

CREATE UNIQUE INDEX IF NOT EXISTS "domain_domain_userId_key" ON "public"."domain"("domain", "userId");

CREATE UNIQUE INDEX IF NOT EXISTS "session_token_key" ON "public"."session"("token");

CREATE UNIQUE INDEX IF NOT EXISTS "account_providerId_accountId_key" ON "public"."account"("providerId", "accountId");

CREATE UNIQUE INDEX IF NOT EXISTS "verification_token_identifier_token_key" ON "public"."verification_token"("identifier", "token");
CREATE UNIQUE INDEX IF NOT EXISTS "verification_token_token_key" ON "public"."verification_token"("token");

CREATE UNIQUE INDEX IF NOT EXISTS "subscription_polarSubscriptionId_key" ON "public"."subscription"("polarSubscriptionId");

CREATE UNIQUE INDEX IF NOT EXISTS "order_polarOrderId_key" ON "public"."order"("polarOrderId");

-- Performance indexes
CREATE INDEX IF NOT EXISTS "idx_event_campaign_type" ON "public"."event"("campaignId", "type");
CREATE INDEX IF NOT EXISTS "idx_event_subscriber_campaign" ON "public"."event"("subscriberId", "campaignId");
CREATE INDEX IF NOT EXISTS "idx_event_messageId" ON "public"."event" ((data->>'messageId')) WHERE (data ? 'messageId');
CREATE INDEX IF NOT EXISTS "idx_subscriber_email" ON "public"."subscriber"("email");
CREATE INDEX IF NOT EXISTS "idx_campaign_user_status" ON "public"."campaign"("userId", "status");

-- AddForeignKey (add only if not exists)
DO $$ BEGIN
    ALTER TABLE "public"."list" ADD CONSTRAINT "list_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "public"."subscriber" ADD CONSTRAINT "subscriber_listId_fkey" FOREIGN KEY ("listId") REFERENCES "public"."list"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "public"."campaign" ADD CONSTRAINT "campaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "public"."campaign" ADD CONSTRAINT "campaign_listId_fkey" FOREIGN KEY ("listId") REFERENCES "public"."list"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "public"."campaign" ADD CONSTRAINT "campaign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "public"."template"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "public"."campaign_stats" ADD CONSTRAINT "campaign_stats_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "public"."campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "public"."template" ADD CONSTRAINT "template_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "public"."event" ADD CONSTRAINT "event_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "public"."subscriber"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "public"."event" ADD CONSTRAINT "event_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "public"."campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "public"."domain" ADD CONSTRAINT "domain_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "public"."session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "public"."account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "public"."subscription" ADD CONSTRAINT "subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "public"."order" ADD CONSTRAINT "order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Data migration: Copy totalCredits to credits for existing subscriptions
UPDATE "public"."subscription" 
SET "credits" = "totalCredits" 
WHERE "credits" = 0 AND "totalCredits" > 0;