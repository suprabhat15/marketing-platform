import { sendEmail, sendBulkEmail } from './ses';
import { prisma } from './prisma';
// import { generateTrackingPixel, generateTrackingUrl } from './tracking';

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
    const subscribers = campaign.list.subscribers;
    const batchSize = 50; // SES limit

    for (let i = 0; i < subscribers.length; i += batchSize) {
      const batch = subscribers.slice(i, i + batchSize);

      for (const subscriber of batch) {
        // Add tracking to content
        // const trackingPixel = generateTrackingPixel(campaignId, subscriber.id);
        // const contentWithTracking = addTrackingToContent(campaign.content, campaignId, subscriber.id);
        // const htmlContent = `${contentWithTracking}${trackingPixel}`;
        console.log("Sending email to " + subscriber.email);
        try {
          await sendEmail({
            to: [subscriber.email],
            subject: campaign.subject,
            html: campaign.content, /** htmlContent */
            configurationSetName: process.env.AWS_SES_CONFIGURATION_SET,
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

function addTrackingToContent(content: string, campaignId: string, subscriberId: string): string {
  // Replace all links with tracking URLs
  const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>/g;
  
  return content.replace(linkRegex, (match, originalUrl) => {
    if (originalUrl.startsWith('http')) {
      const trackingUrl = generateTrackingUrl(originalUrl, campaignId, subscriberId);
      return match.replace(originalUrl, trackingUrl);
    }
    return match;
  });
}

/////////////////////////////

// lib/email-service.ts
// import { SESClient, SendBulkTemplatedEmailCommand } from '@aws-sdk/client-ses';
// import { prisma } from '@/lib/prisma';
// import { z } from 'zod';

// interface Campaign {
//   id: string;
//   name: string;
//   subject: string;
//   fromEmail: string;
//   fromName: string;
//   lists: {
//     contacts: {
//       id: string;
//       email: string;
//       firstName: string | null;
//       lastName: string | null;
//       customFields: Record<string, any>;
//     }[];
//   }[];
//   template: {
//     htmlContent: string;
//     textContent: string | null;
//   } | null;
// }

// class EmailService {
//   private sesClient: SESClient;
//   private readonly maxRecipientsPerBulk = 50;

//   constructor() {
//     this.sesClient = new SESClient({
//       region: process.env.AWS_REGION!,
//       credentials: {
//         accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
//         secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
//       },
//     });
//   }

//   async sendCampaign(campaign: Campaign) {
//     try {
//       // Get all contacts from campaign lists
//       const allContacts = campaign.lists.flatMap((list) => list.contacts);

//       if (allContacts.length === 0) {
//         throw new Error('No contacts found for this campaign');
//       }

//       // Update campaign status to sending
//       await prisma.campaign.update({
//         where: { id: campaign.id },
//         data: { status: 'SENDING' },
//       });

//       // Split contacts into chunks for bulk sending
//       const contactChunks = this.chunkArray(allContacts, this.maxRecipientsPerBulk);

//       let totalSent = 0;
//       let totalFailed = 0;

//       for (const chunk of contactChunks) {
//         try {
//           const result = await this.sendBulkEmail(campaign, chunk);
//           totalSent += result.sent;
//           totalFailed += result.failed;

//           // Log each email
//           await this.logEmails(campaign, chunk, result.messageIds);

//           // Rate limiting - AWS SES allows 14 emails per second in sandbox
//           await this.delay(1000);
//         } catch (error) {
//           console.error('Error sending bulk email:', error);
//           totalFailed += chunk.length;
//         }
//       }

//       // Update campaign with final status
//       await prisma.campaign.update({
//         where: { id: campaign.id },
//         data: {
//           status: totalFailed === 0 ? 'SENT' : 'PARTIALLY_SENT',
//           sentAt: new Date(),
//           recipientCount: totalSent,
//         },
//       });

//       return {
//         totalSent,
//         totalFailed,
//         totalContacts: allContacts.length,
//       };
//     } catch (error) {
//       // Update campaign status to failed
//       await prisma.campaign.update({
//         where: { id: campaign.id },
//         data: { status: 'FAILED' },
//       });

//       throw error;
//     }
//   }

//   private async sendBulkEmail(campaign: Campaign, contacts: any[]) {
//     // Create SES template if it doesn't exist
//     const templateName = `campaign-${campaign.id}`;
//     await this.createSESTemplate(templateName, campaign);

//     const destinations = contacts.map((contact) => ({
//       Destination: {
//         ToAddresses: [contact.email],
//       },
//       ReplacementTemplateData: JSON.stringify({
//         firstName: contact.firstName || '',
//         lastName: contact.lastName || '',
//         email: contact.email,
//         ...contact.customFields,
//         unsubscribeUrl: `${process.env.NEXT_PUBLIC_APP_URL}/unsubscribe?email=${encodeURIComponent(
//           contact.email
//         )}&campaignId=${campaign.id}`,
//       }),
//     }));

//     const command = new SendBulkTemplatedEmailCommand({
//       Source: `${campaign.fromName} <${campaign.fromEmail}>`,
//       Template: templateName,
//       DefaultTemplateData: JSON.stringify({}),
//       Destinations: destinations,
//       ConfigurationSetName: process.env.AWS_SES_CONFIGURATION_SET,
//     });

//     const response = await this.sesClient.send(command);

//     return {
//       sent: destinations.length - (response.Status?.length || 0),
//       failed: response.Status?.length || 0,
//       messageIds: response.MessageId ? [response.MessageId] : [],
//     };
//   }

//   private async createSESTemplate(templateName: string, campaign: Campaign) {
//     // Implementation for creating SES template
//     // This would use CreateTemplateCommand from AWS SES
//     // For brevity, assuming template creation is handled elsewhere
//   }

//   private async logEmails(campaign: Campaign, contacts: any[], messageIds: string[]) {
//     const emailLogs = contacts.map((contact, index) => ({
//       campaignId: campaign.id,
//       contactId: contact.id,
//       email: contact.email,
//       messageId: messageIds[index] || null,
//       status: 'SENT' as const,
//       sentAt: new Date(),
//     }));

//     await prisma.emailLog.createMany({
//       data: emailLogs,
//     });
//   }

//   private chunkArray<T>(array: T[], size: number): T[][] {
//     const chunks: T[][] = [];
//     for (let i = 0; i < array.length; i += size) {
//       chunks.push(array.slice(i, i + size));
//     }
//     return chunks;
//   }

//   private delay(ms: number): Promise<void> {
//     return new Promise((resolve) => setTimeout(resolve, ms));
//   }
// }

// export const emailService = new EmailService();
// export const sendCampaign = (campaign: Campaign) => emailService.sendCampaign(campaign);