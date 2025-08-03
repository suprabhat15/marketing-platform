import { sendEmail } from './ses';
import { prisma } from './prisma';
import { createEmailTracker } from './tracking';

export async function sendCampaign(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      list: {
        include: {
          subscribers: {
            where: {
              status: 'ACTIVE',
            },
          },
        },
      },
    },
  });

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') { // DOUBT: why checking for two  status 
  // simultaneously as it will always be false ?
    throw new Error('Campaign cannot be sent'); 
  }

  // Update campaign status
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status: 'SENDING',
    },
  });
  console.log("Campaign status updated to SENDING");
  try {
    // Filter subscribers based on selected subscriber IDs from campaign
    const selectedIds = Array.isArray(campaign.subscriberIds) ? campaign.subscriberIds : [];
    
    // Validate that subscribers are selected
    if (selectedIds.length === 0) {
      throw new Error('No subscribers selected for this campaign. Please select at least one subscriber.');
    }
    
    const allSubscribers = campaign.list.subscribers;
    const subscribers = allSubscribers.filter(subscriber => selectedIds.includes(subscriber.id));
    
    // Validate that selected subscribers actually exist and are active
    if (subscribers.length === 0) {
      throw new Error('None of the selected subscribers are active or found in the list.');
    }
    
    console.log(`Sending campaign to ${subscribers.length} selected subscribers out of ${allSubscribers.length} total subscribers`);
    
    const batchSize = 50; // SES limit
    const tracker = createEmailTracker();

    for (let i = 0; i < subscribers.length; i += batchSize) {
      const batch = subscribers.slice(i, i + batchSize);

      for (const subscriber of batch) {
        console.log("Sending email to " + subscriber.email);
        try {
          // Generate tracking data
          const trackingParams = {
            campaignId: campaignId,
            subscriberId: subscriber.id,
            listId: campaign.list.id,
          };

          // Add tracking to email content
          const htmlContentWithTracking = tracker.injectTrackingIntoHtml(
            campaign.content,
            trackingParams
          );

          // Generate unique message ID for this email
          const messageId = `${campaignId}-${subscriber.id}-${Date.now()}`;

          await sendEmail({
            to: [subscriber.email],
            subject: campaign.subject,
            html: htmlContentWithTracking,
            configurationSetName: process.env.AWS_SES_CONFIGURATION_SET,
            campaignId: campaignId,
            messageId: messageId,
          });

          // Log sent event
          await prisma.event.create({
            data: {
              type: 'SENT',
              subscriberId: subscriber.id,
              campaignId: campaignId,
              data: {
                email: subscriber.email,
                subject: campaign.subject,
                messageId: messageId,
                timestamp: new Date().toISOString(),
              },
            },
          });
        } catch (error) {
          console.error(`Failed to send email to ${subscriber.email}:`, error);
          
          // Log failed event
          await prisma.event.create({
            data: {
              type: 'BOUNCED',
              subscriberId: subscriber.id,
              campaignId: campaignId,
              data: {
                error: error instanceof Error ? error.message : 'Unknown error',
                email: subscriber.email,
                timestamp: new Date().toISOString(),
              },
            },
          });
        }
      }

      // Add delay between batches to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Update campaign status
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
      },
    });

  } catch (error) {
    // Update campaign status to failed
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'DRAFT', // Allow retry
      },
    });
    throw error;
  }
}

// Tracking is now handled by the EmailTracker class in the tracking library
