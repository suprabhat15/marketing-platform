-- Safe migration: Make replyTo required with proper data backfill

-- Step 1: Backfill NULL values with fromEmail before making the field required
UPDATE "public"."campaign" 
SET "replyTo" = "fromEmail" 
WHERE "replyTo" IS NULL AND "fromEmail" IS NOT NULL;

-- Step 2: For any remaining NULL values (edge case), use a default
UPDATE "public"."campaign" 
SET "replyTo" = 'reply@mailpackr.net' 
WHERE "replyTo" IS NULL;

-- Step 3: Backfill empty strings with fromEmail  
UPDATE "public"."campaign" 
SET "replyTo" = "fromEmail" 
WHERE "replyTo" = '' AND "fromEmail" IS NOT NULL AND "fromEmail" != '';

-- Step 4: For empty strings without valid fromEmail, use default
UPDATE "public"."campaign" 
SET "replyTo" = 'reply@mailpackr.net' 
WHERE "replyTo" = '';

-- Step 5: Now safely make the column NOT NULL with default
ALTER TABLE "public"."campaign" ALTER COLUMN "replyTo" SET DEFAULT '';
ALTER TABLE "public"."campaign" ALTER COLUMN "replyTo" SET NOT NULL;