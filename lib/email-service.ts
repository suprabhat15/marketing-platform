import { sendEmail } from './ses';
import { prisma } from './prisma';

function replaceVariables(content: string, subscriber: any): string {
  let processedContent = content;
  
  // Replace subscriber-specific variables
  const variables = {
    firstName: subscriber.firstName || subscriber.name?.split(' ')[0] || '',
    lastName: subscriber.lastName || subscriber.name?.split(' ').slice(1).join(' ') || '',
    email: subscriber.email || '',
    name: subscriber.name || '',
    // Add unsubscribe URL (you may want to generate this dynamically)
    unsubscribeUrl: `${process.env.NEXT_PUBLIC_APP_URL}/unsubscribe?email=${encodeURIComponent(subscriber.email)}`,
  };
  
  // Replace all variables in the format {{variableName}}
  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    processedContent = processedContent.replace(regex, String(value));
  });
  
  return processedContent;
}


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

    for (let i = 0; i < subscribers.length; i += batchSize) {
      const batch = subscribers.slice(i, i + batchSize);

      for (const subscriber of batch) {
        console.log("Sending email to " + subscriber.email);
        try {
          // Generate unique message ID for this email
          const messageId = `${campaignId}-${subscriber.id}-${Date.now()}`;

          // Process template variables for this subscriber
          const processedContent = replaceVariables(campaign.content, subscriber);
          const processedSubject = replaceVariables(campaign.subject, subscriber);

          await sendEmail({
            to: [subscriber.email],
            subject: processedSubject,
            html: processedContent,
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
                subject: processedSubject,
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

