-- Add messageId field to Event table for better tracking
-- This migration ensures we can properly track unique email messages

-- Add index on Event table for better performance on campaign queries
CREATE INDEX IF NOT EXISTS "idx_event_campaign_type" ON "event"("campaignId", "type");
CREATE INDEX IF NOT EXISTS "idx_event_subscriber_campaign" ON "event"("subscriberId", "campaignId");

-- Add index for messageId in JSON data for faster lookups
-- Equality lookups: BTREE expression index + partial predicate
CREATE INDEX IF NOT EXISTS "idx_event_messageId"
  ON "event" ((data->>'messageId'))
  WHERE (data ? 'messageId');
-- Add performance indexes for webhook processing
CREATE INDEX IF NOT EXISTS "idx_subscriber_email" ON "subscriber"("email");
CREATE INDEX IF NOT EXISTS "idx_campaign_user_status" ON "campaign"("userId", "status");

-- Update any existing events without proper timestamps
UPDATE "event" 
SET "createdAt" = NOW() 
WHERE "createdAt" IS NULL;