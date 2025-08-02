// lib/campaign-scheduler.ts
import { prisma } from '@/lib/prisma';
import { sendCampaign } from '@/lib/email-service';

export class CampaignScheduler {
  async processScheduledCampaigns() {
    try {
      const now = new Date();

      const scheduledCampaigns = await prisma.campaign.findMany({
        where: {
          status: 'SCHEDULED',
          scheduledAt: {
            lte: now,
          },
        },
        include: {
          lists: {
            include: {
              contacts: true,
            },
          },
          template: true,
        },
      });

      console.log(`Found ${scheduledCampaigns.length} campaigns to process`);

      for (const campaign of scheduledCampaigns) {
        try {
          console.log(`Processing campaign: ${campaign.id}`);

          const result = await sendCampaign(campaign);

          console.log(`Campaign ${campaign.id} sent successfully:`, result);
        } catch (error) {
          console.error(`Error processing campaign ${campaign.id}:`, error);

          await prisma.campaign.update({
            where: { id: campaign.id },
            data: { status: 'FAILED' },
          });
        }
      }
    } catch (error) {
      console.error('Error in processScheduledCampaigns:', error);
    }
  }
}

export const campaignScheduler = new CampaignScheduler();