import Bull, { Queue, Job } from 'bull';
import { redis } from './redis';
import { sendEmail } from './ses';
import { prisma } from './prisma';
import { broadcastEvent, broadcastCampaignUpdate } from './event-broadcast';

// Template variable replacement function
function replaceVariables(content: string, subscriber: any): string {
  let processedContent = content;
  
  // Replace subscriber-specific variables
  const variables = {
    firstName: subscriber.firstName || subscriber.name?.split(' ')[0] || '',
    lastName: subscriber.lastName || subscriber.name?.split(' ').slice(1).join(' ') || '',
    email: subscriber.email || '',
    unsubscribeUrl: `${process.env.NEXT_PUBLIC_APP_URL}/unsubscribe?email=${encodeURIComponent(subscriber.email)}`,
  };
  
  // Replace all variables in the format {{variableName}}
  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    processedContent = processedContent.replace(regex, String(value));
  });
  
  return processedContent;
}

// Function to check if a campaign is complete and update its status
async function checkCampaignCompletion(campaignId: string) {
  try {
    // Get campaign details
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        list: {
          include: {
            subscribers: {
              where: { status: 'ACTIVE' }
            }
          }
        }
      }
    });

    if (!campaign || campaign.status !== 'SENDING') {
      return; // Campaign not found or not in sending state
    }

    const totalSubscribers = campaign.list.subscribers.length;
    if (totalSubscribers === 0) {
      return; // No subscribers to check
    }

    // Check how many emails have been sent for this campaign
    const emailCounts = await prisma.event.groupBy({
      by: ['type'],
      where: {
        campaignId: campaignId
      },
      _count: {
        type: true
      }
    });

    const sentCount = emailCounts.find(count => count.type === 'SENT')?._count.type || 0;
    const bouncedCount = emailCounts.find(count => count.type === 'BOUNCED')?._count.type || 0;
    const totalProcessed = sentCount + bouncedCount;

    console.log(`📊 Campaign ${campaignId}: ${sentCount} sent, ${bouncedCount} bounced, ${totalProcessed}/${totalSubscribers} total`);

    // Check if all emails have been processed (sent or bounced)
    if (totalProcessed >= totalSubscribers) {
      // All emails processed, update campaign status to SENT
      const updatedCampaign = await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: 'SENT',
          sentAt: new Date()
        }
      });

      console.log(`✅ Campaign ${campaignId} completed! Status updated to SENT (${sentCount} sent, ${bouncedCount} bounced)`);
    }

  } catch (error) {
    console.error(`Error checking campaign completion for ${campaignId}:`, error);
  }
}

// Define job data interfaces
interface CampaignJobData {
  campaignId: string;
  userId: string;
  batchSize?: number;
}

interface BatchJobData {
  campaignId: string;
  subscriberIds: string[];
  templateHtml: string;
  subject: string;
  fromEmail: string;
  fromName: string;
  replyTo: string;
  batchNumber: number;
  totalBatches: number;
}

interface EmailJobData {
  campaignId: string;
  subscriberId: string;
  email: string;
  templateHtml: string;
  subject: string;
  fromEmail: string;
  fromName: string;
  replyTo: string;
  messageId: string;
}

// Queue configuration
const queueConfig = {
  redis: {
    port: 6379,
    host: process.env.REDIS_URL?.replace('redis://', '').split(':')[0] || 'localhost',
    password: process.env.REDIS_PASSWORD,
  },
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
};

// Create queues
export const campaignQueue: Queue<CampaignJobData> = new Bull('campaign-processing', queueConfig);
export const batchQueue: Queue<BatchJobData> = new Bull('batch-processing', queueConfig);
export const emailQueue: Queue<EmailJobData> = new Bull('email-sending', queueConfig);

// INFO: When a worker instance is created, it launches the processor immediately

// Campaign queue processor/Worker
campaignQueue.process('process-campaign', async (job: Job<CampaignJobData>) => {
  const { campaignId, userId, batchSize = 100 } = job.data;
  
  console.log(`Processing campaign ${campaignId} for user ${userId}`);
  
  try {
    // Get campaign details
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        template: true,
        list: {
          include: {
            subscribers: {
              where: {
                status: 'ACTIVE'
              }
            }
          }
        }
      }
    });

    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    if (!campaign.template) {
      throw new Error(`Template not found for campaign ${campaignId}`);
    }

    const subscribers = campaign.list.subscribers;
    if (subscribers.length === 0) {
      console.log(`No active subscribers found for campaign ${campaignId}`);
      return;
    }

    // Update campaign status
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { 
        status: 'SENDING',
        sentAt: new Date()
      }
    });

    // Split subscribers into batches
    const totalBatches = Math.ceil(subscribers.length / batchSize);
    console.log(`Splitting ${subscribers.length} subscribers into ${totalBatches} batches of ${batchSize}`);

    for (let i = 0; i < totalBatches; i++) {
      const startIndex = i * batchSize;
      const endIndex = Math.min(startIndex + batchSize, subscribers.length);
      const batchSubscribers = subscribers.slice(startIndex, endIndex);

      // Add batch job
      await batchQueue.add('process-batch', {
        campaignId,
        subscriberIds: batchSubscribers.map(s => s.id),
        templateHtml: campaign.template.html || campaign.template.content || campaign.content || '',
        subject: campaign.subject,
        fromEmail: process.env.FROM_EMAIL!,
        fromName: process.env.FROM_NAME || 'MailPackr',
        replyTo: process.env.REPLY_TO_EMAIL!,
        batchNumber: i + 1,
        totalBatches
      }, {
        delay: i * 1000, // Stagger batches by 1 second
      });
    }

    console.log(`Queued ${totalBatches} batches for campaign ${campaignId}`);

  } catch (error) {
    console.error(`Error processing campaign ${campaignId}:`, error);
    
    // Update campaign status to failed
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'FAILED' }
    });
    
    throw error;
  }
});

// Batch queue processor/Worker
batchQueue.process('process-batch', async (job: Job<BatchJobData>) => {
  const { 
    campaignId, 
    subscriberIds, 
    templateHtml, 
    subject, 
    fromEmail, 
    fromName, 
    replyTo,
    batchNumber,
    totalBatches 
  } = job.data;

  console.log(`Processing batch ${batchNumber}/${totalBatches} for campaign ${campaignId} (${subscriberIds.length} emails)`);

  try {
    // Get subscriber details
    const subscribers = await prisma.subscriber.findMany({
      where: {
        id: { in: subscriberIds }
      }
    });

    // Queue individual email jobs
    for (const subscriber of subscribers) {
      const messageId = `${campaignId}-${subscriber.id}-${Date.now()}`;
      
      // Process template variables for each subscriber
      const personalizedHtml = replaceVariables(templateHtml, subscriber);
      const personalizedSubject = replaceVariables(subject, subscriber);
      
      await emailQueue.add('send-email', {
        campaignId,
        subscriberId: subscriber.id,
        email: subscriber.email,
        templateHtml: personalizedHtml,
        subject: personalizedSubject,
        fromEmail,
        fromName,
        replyTo,
        messageId
      }, {
        delay: Math.random() * 2000, // Random delay up to 2 seconds to avoid rate limits
      });
    }

    console.log(`Queued ${subscribers.length} emails for batch ${batchNumber}/${totalBatches}`);

  } catch (error) {
    console.error(`Error processing batch ${batchNumber} for campaign ${campaignId}:`, error);
    throw error;
  }
});

// Email queue processor/Worker
emailQueue.process('send-email', 5, async (job: Job<EmailJobData>) => {
  const { 
    campaignId, 
    subscriberId, 
    email, 
    templateHtml, 
    subject, 
    fromEmail, 
    fromName, 
    replyTo,
    messageId 
  } = job.data;

  try {
    // Send the email
    await sendEmail({
      to: [email],
      subject,
      html: templateHtml,
      from: `${fromName} <${fromEmail}>`,
      replyTo,
      campaignId,
      messageId
    });

    console.log(`✓ Email sent to ${email} for campaign ${campaignId}`);

    // Don't create SENT event here - let SES webhook handle it
    // The SES "send" event will create the SENT event when AWS confirms receipt

  } catch (error) {
    console.error(`Failed to send email to ${email} for campaign ${campaignId}:`, error);
    
    // Log failed event
    try {
      const failedEvent = await prisma.event.create({
        data: {
          type: 'BOUNCED',
          data: {
            email,
            messageId,
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          subscriberId,
          campaignId,
        },
        include: {
          subscriber: {
            select: {
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      await broadcastEvent(campaignId, failedEvent);
    } catch (eventError) {
      console.error('Error creating failed event:', eventError);
    }
    
    throw error;
  }
});

// Queue event listeners
campaignQueue.on('completed', async (job) => {
  console.log(`Campaign job ${job.id} completed`);
  
  // Campaign job completion just means batches are queued, not that emails are sent
  // We'll check for campaign completion after all emails are sent
});

campaignQueue.on('failed', async (job, err) => {
  console.error(`Campaign job ${job.id} failed:`, err.message);
});

batchQueue.on('completed', async (job) => {
  console.log(`Batch job ${job.id} completed`);
});

batchQueue.on('failed', async (job, err) => {
  console.error(`Batch job ${job.id} failed:`, err.message);
});

emailQueue.on('completed', async (job) => {
  const { campaignId } = job.data;
  console.log(`📧 Email job ${job.id} completed for campaign ${campaignId}`);
  
  // Check if this campaign is now complete
  await checkCampaignCompletion(campaignId);
});

emailQueue.on('failed', async (job, err) => {
  console.error(`Email job ${job.id} failed:`, err.message);
  
  const { campaignId } = job.data;
  
  // Check if this campaign is now complete (even with failed emails)
  await checkCampaignCompletion(campaignId);
});

// Queue management functions
export async function addCampaignToQueue(campaignId: string, userId: string, options?: { batchSize?: number }) {
  const job = await campaignQueue.add('process-campaign', {
    campaignId,
    userId,
    batchSize: options?.batchSize || 100
  }, {
    priority: 1,
  });

  // Start on-demand worker when campaign is queued
  try {
    const { startOnDemandWorker } = await import('./on-demand-queue-worker');
    await startOnDemandWorker();
    console.log(`🎯 On-demand worker started for campaign: ${campaignId}`);
  } catch (error) {
    console.error('Failed to start on-demand worker:', error);
    // Don't fail the job queue if worker fails to start
  }

  return job;
}

export async function getQueueStats() {
  const [campaignStats, batchStats, emailStats] = await Promise.all([
    campaignQueue.getJobCounts(),
    batchQueue.getJobCounts(),
    emailQueue.getJobCounts(),
  ]);

  return {
    campaign: campaignStats,
    batch: batchStats,
    email: emailStats,
  };
}

export async function getCampaignQueueStatus(campaignId: string) {
  // Get all jobs related to this campaign
  const [campaignJobs, batchJobs, emailJobs] = await Promise.all([
    campaignQueue.getJobs(['waiting', 'active', 'completed', 'failed']),
    batchQueue.getJobs(['waiting', 'active', 'completed', 'failed']),
    emailQueue.getJobs(['waiting', 'active', 'completed', 'failed'])
  ]);

  const campaignJob = campaignJobs.find(job => job.data.campaignId === campaignId);
  const relatedBatchJobs = batchJobs.filter(job => job.data.campaignId === campaignId);
  const relatedEmailJobs = emailJobs.filter(job => job.data.campaignId === campaignId);

  return {
    campaign: {
      status: campaignJob?.finishedOn ? 'completed' : campaignJob?.failedReason ? 'failed' : 'processing',
      job: campaignJob
    },
    batches: {
      total: relatedBatchJobs.length,
      completed: relatedBatchJobs.filter(job => job.finishedOn).length,
      failed: relatedBatchJobs.filter(job => job.failedReason).length,
    },
    emails: {
      total: relatedEmailJobs.length,
      completed: relatedEmailJobs.filter(job => job.finishedOn).length,
      failed: relatedEmailJobs.filter(job => job.failedReason).length,
    }
  };
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, closing queues gracefully...');
  await Promise.all([
    campaignQueue.close(),
    batchQueue.close(),
    emailQueue.close()
  ]);
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, closing queues gracefully...');
  await Promise.all([
    campaignQueue.close(),
    batchQueue.close(),
    emailQueue.close()
  ]);
  process.exit(0);
});