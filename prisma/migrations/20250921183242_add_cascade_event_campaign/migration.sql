-- DropForeignKey
ALTER TABLE "public"."event" DROP CONSTRAINT "event_campaignId_fkey";

-- AddForeignKey
ALTER TABLE "public"."event" ADD CONSTRAINT "event_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "public"."campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
