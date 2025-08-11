import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/ses';
import { EmailTracker } from '@/lib/tracking';

export interface ScheduledCampaign {
  id: string;
  name: string;
  scheduledAt: Date;
  templateId: string;
  listId: string;
  userId: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  trigger: 'EMAIL_OPEN' | 'LINK_CLICK' | 'TIME_DELAY' | 'FORM_SUBMIT';
  conditions: Record<string, any>;
  action: 'SEND_EMAIL' | 'ADD_TO_LIST' | 'REMOVE_FROM_LIST' | 'UPDATE_STATUS';
  actionData: Record<string, any>;
  isActive: boolean;
}

export class EmailScheduler {

  // Process scheduled campaigns
  static async processScheduledCampaigns() {
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
          template: true,
          list: {
            include: {
              recipients: {
                where: {
                  status: 'ACTIVE',
                },
              },
            },
          },
        },
      });

      console.log(`Found ${scheduledCampaigns.length} campaigns to process`);

      for (const campaign of scheduledCampaigns) {
        await this.executeCampaign(campaign);
      }
    } catch (error) {
      console.error('Error processing scheduled campaigns:', error);
    }
  }

  // Execute a single campaign
  static async executeCampaign(campaign: any) {
    try {
      console.log(`Executing campaign: ${campaign.name}`);

      // Update campaign status
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { 
          status: 'SENDING',
          sentAt: new Date(),
        },
      });

      const recipients = campaign.list.recipients;
      let successCount = 0;
      let failureCount = 0;

      // Process recipients in batches
      const batchSize = 50;
      for (let i = 0; i < recipients.length; i += batchSize) {
        const batch = recipients.slice(i, i + batchSize);
        
        await Promise.allSettled(
          batch.map(async (recipient) => {
            try {
              // Process email content with tracking
              const processedContent = EmailTracker.processEmailContent(
                campaign.template.htmlContent,
                campaign.id,
                recipient.email
              );

              // Personalize content
              const personalizedContent = this.personalizeContent(
                processedContent,
                recipient
              );

              const personalizedSubject = this.personalizeContent(
                campaign.template.subject,
                recipient
              );

              // Send email
              await sendEmail({
                to: [recipient.email],
                subject: personalizedSubject,
                html: personalizedContent,
                text: campaign.template.content || undefined,
              });

              successCount++;
            } catch (error) {
              console.error(`Failed to send to ${recipient.email}:`, error);
              failureCount++;
            }
          })
        );

        // Small delay between batches to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Update campaign status
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          status: 'SENT',
          stats: {
            sent: successCount,
            failed: failureCount,
          },
        },
      });

      console.log(`Campaign ${campaign.name} completed: ${successCount} sent, ${failureCount} failed`);
    } catch (error) {
      console.error(`Error executing campaign ${campaign.id}:`, error);
      
      // Mark campaign as failed
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: 'FAILED' },
      });
    }
  }

  // Personalize email content with recipient data
  static personalizeContent(content: string, recipient: any): string {
    const variables = {
      '{{firstName}}': recipient.firstName || '',
      '{{lastName}}': recipient.lastName || '',
      '{{email}}': recipient.email || '',
      '{{fullName}}': `${recipient.firstName || ''} ${recipient.lastName || ''}`.trim(),
      '{{unsubscribeUrl}}': `${process.env.NEXT_PUBLIC_APP_URL}/unsubscribe?email=${encodeURIComponent(recipient.email)}`,
    };

    let personalizedContent = content;
    Object.entries(variables).forEach(([key, value]) => {
      personalizedContent = personalizedContent.replace(
        new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'),
        value
      );
    });

    return personalizedContent;
  }

  // Process automation rules
  static async processAutomationRules() {
    try {
      const activeRules = await prisma.automationRule.findMany({
        where: { isActive: true },
      });

      for (const rule of activeRules) {
        await this.executeAutomationRule(rule);
      }
    } catch (error) {
      console.error('Error processing automation rules:', error);
    }
  }

  // Execute automation rule
  static async executeAutomationRule(rule: any) {
    try {
      let eligibleRecipients: any[] = [];

      switch (rule.trigger) {
        case 'EMAIL_OPEN':
          eligibleRecipients = await this.getRecipientsForEmailOpenTrigger(rule);
          break;
        case 'LINK_CLICK':
          eligibleRecipients = await this.getRecipientsForLinkClickTrigger(rule);
          break;
        case 'TIME_DELAY':
          eligibleRecipients = await this.getRecipientsForTimeDelayTrigger(rule);
          break;
        default:
          console.log(`Unknown trigger type: ${rule.trigger}`);
          return;
      }

      for (const recipient of eligibleRecipients) {
        await this.executeAutomationAction(rule, recipient);
      }
    } catch (error) {
      console.error(`Error executing automation rule ${rule.id}:`, error);
    }
  }

  // Get recipients for email open trigger
  static async getRecipientsForEmailOpenTrigger(rule: any) {
    const { campaignId, waitHours = 24 } = rule.conditions;
    const cutoffTime = new Date(Date.now() - waitHours * 60 * 60 * 1000);

    // Find recipients who opened the email after the cutoff time
    const events = await prisma.emailEvent.findMany({
      where: {
        campaignId,
        eventType: 'OPEN',
        timestamp: {
          gte: cutoffTime,
        },
      },
      select: {
        recipientEmail: true,
      },
      distinct: ['recipientEmail'],
    });

    return events.map(event => ({ email: event.recipientEmail }));
  }

  // Get recipients for link click trigger
  static async getRecipientsForLinkClickTrigger(rule: any) {
    const { campaignId, linkUrl, waitHours = 24 } = rule.conditions;
    const cutoffTime = new Date(Date.now() - waitHours * 60 * 60 * 1000);

    const events = await prisma.emailEvent.findMany({
      where: {
        campaignId,
        eventType: 'CLICK',
        timestamp: {
          gte: cutoffTime,
        },
        metadata: {
          path: ['originalUrl'],
          equals: linkUrl,
        },
      },
      select: {
        recipientEmail: true,
      },
      distinct: ['recipientEmail'],
    });

    return events.map(event => ({ email: event.recipientEmail }));
  }

  // Get recipients for time delay trigger
  static async getRecipientsForTimeDelayTrigger(rule: any) {
    const { listId, delayHours = 24 } = rule.conditions;
    const cutoffTime = new Date(Date.now() - delayHours * 60 * 60 * 1000);

    const recipients = await prisma.recipient.findMany({
      where: {
        listId,
        status: 'ACTIVE',
        createdAt: {
          lte: cutoffTime,
        },
      },
    });

    return recipients;
  }

  // Execute automation action
  static async executeAutomationAction(rule: any, recipient: any) {
    try {
      switch (rule.action) {
        case 'SEND_EMAIL':
          await this.sendAutomationEmail(rule.actionData, recipient);
          break;
        case 'ADD_TO_LIST':
          await this.addToList(rule.actionData.listId, recipient.email);
          break;
        case 'REMOVE_FROM_LIST':
          await this.removeFromList(rule.actionData.listId, recipient.email);
          break;
        case 'UPDATE_STATUS':
          await this.updateRecipientStatus(recipient.email, rule.actionData.status);
          break;
        default:
          console.log(`Unknown action type: ${rule.action}`);
      }
    } catch (error) {
      console.error(`Error executing action for recipient ${recipient.email}:`, error);
    }
  }

  // Send automation email
  static async sendAutomationEmail(actionData: any, recipient: any) {
    const { templateId } = actionData;
    
    const template = await prisma.template.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    const processedContent = this.personalizeContent(
      template.htmlContent,
      recipient
    );

    const personalizedSubject = this.personalizeContent(
      template.subject,
      recipient
    );

    await sendEmail({
      to: [recipient.email],
      subject: personalizedSubject,
      html: processedContent,
      text: template.content || undefined,
    });
  }

  // Add recipient to list
  static async addToList(listId: string, email: string) {
    await prisma.recipient.upsert({
      where: {
        email_listId: {
          email,
          listId,
        },
      },
      update: {
        status: 'ACTIVE',
      },
      create: {
        email,
        listId,
        status: 'ACTIVE',
      },
    });
  }

  // Remove recipient from list
  static async removeFromList(listId: string, email: string) {
    await prisma.recipient.updateMany({
      where: {
        email,
        listId,
      },
      data: {
        status: 'UNSUBSCRIBED',
      },
    });
  }

  // Update recipient status
  static async updateRecipientStatus(email: string, status: string) {
    await prisma.recipient.updateMany({
      where: { email },
      data: { status },
    });
  }

  // Clean up old events (run weekly)
  static async cleanupOldEvents() {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const result = await prisma.emailEvent.deleteMany({
        where: {
          timestamp: {
            lt: thirtyDaysAgo,
          },
        },
      });

      console.log(`Cleaned up ${result.count} old email events`);
    } catch (error) {
      console.error('Error cleaning up old events:', error);
    }
  }
}