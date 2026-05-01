import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { addCampaignToQueue } from '@/lib/queue';
import { z } from 'zod';
import { invalidateUserCache } from '@/lib/redis-cache';
import { sesQuotaManager } from '@/lib/ses-quota-manager';
import { checkSuspension } from '@/lib/check-suspension';

const sendCampaignSchema = z.object({
  scheduleAt: z.string().datetime().optional(),
  batchSize: z.number().min(1).max(1000).optional().default(100),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  try {
    const { campaignId } = await params;
    
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const suspensionResponse = await checkSuspension(session.user.id);
    if (suspensionResponse) return suspensionResponse;

    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        userId: session.user.id,
      },
      include: {
        template: true,
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
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (campaign.status === 'SENT') {
      return NextResponse.json(
        { error: 'Campaign already sent' },
        { status: 400 }
      );
    }

    if (campaign.status === 'SENDING' || campaign.status === 'QUEUED') {
      return NextResponse.json(
        { error: 'Campaign is already being processed' },
        { status: 400 }
      );
    }

    if (!campaign.template) {
      return NextResponse.json(
        { error: 'Campaign template not found' },
        { status: 400 }
      );
    }

    if (!campaign.template.html && !campaign.template.content) {
      return NextResponse.json(
        { error: 'Campaign template has no content' },
        { status: 400 }
      );
    }

    let scheduleAt: string | undefined;
    let batchSize = 100;
    
    try {
      const contentType = request.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const body = await request.json();
        const parsed = sendCampaignSchema.parse(body);
        scheduleAt = parsed.scheduleAt;
        batchSize = parsed.batchSize || 100;
        console.log('📝 Parsed request body:', { scheduleAt, batchSize });
      } else {
        console.log('📤 No JSON body provided, using defaults');
      }
    } catch (error) {
      console.log('⚠️ Error parsing request body, using defaults:', error instanceof Error ? error.message : error);
    }

    if (scheduleAt) {
      const scheduledDate = new Date(scheduleAt);
      if (scheduledDate <= new Date()) {
        return NextResponse.json(
          { error: 'Schedule date must be in the future' },
          { status: 400 }
        );
      }

      await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: 'SCHEDULED',
          scheduledAt: scheduledDate,
        },
      });

      // Invalidate campaigns cache
      await invalidateUserCache(session.user.id, 'campaigns');

      return NextResponse.json({
        message: 'Campaign scheduled successfully',
        scheduledAt: scheduledDate,
      });
    } else {
      // Check if there are active subscribers
      const activeSubscribersCount = campaign.list.subscribers.length;
      if (activeSubscribersCount === 0) {
        return NextResponse.json(
          { error: 'No active subscribers found in the selected list' },
          { status: 400 }
        );
      }

      // Check SES quota before sending campaign
      const quotaCheck = await sesQuotaManager.canSendCampaign(activeSubscribersCount);
      if (!quotaCheck.canSend) {
        return NextResponse.json(
          { 
            error: quotaCheck.reason,
            quotaInfo: {
              dailyLimit: quotaCheck.quotaInfo.max24HourSend,
              sentToday: quotaCheck.quotaInfo.sentLast24Hours,
              remaining: quotaCheck.quotaInfo.remainingQuota
            }
          },
          { status: 429 } // Too Many Requests
        );
      }

      console.log(
        `🚀 Queuing campaign ${campaignId} with ${activeSubscribersCount} subscribers`
      );

      // Update campaign status to queued first
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { 
          status: 'QUEUED',
          queuedAt: new Date()
        }
      });

      // Add campaign to queue for processing
      const job = await addCampaignToQueue(campaign.id, session.user.id, {
        batchSize
      });

      // Invalidate campaigns cache
      await invalidateUserCache(session.user.id, 'campaigns');

      console.log(`✅ Campaign ${campaignId} queued successfully with job ID: ${job.id}`);

      return NextResponse.json({
        message: 'Campaign queued for sending',
        status: 'QUEUED',
        jobId: job.id,
        subscriberCount: activeSubscribersCount,
        batchSize,
        estimatedBatches: Math.ceil(activeSubscribersCount / batchSize),
        queuedAt: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error('Error sending campaign:', error);
    return NextResponse.json(
      { error: 'Failed to send campaign ' + error },
      { status: 500 }
    );
  }
}