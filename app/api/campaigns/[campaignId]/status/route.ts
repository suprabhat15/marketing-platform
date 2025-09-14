import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCampaignQueueStatus, getQueueStats } from '@/lib/queue';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  try {
    const { campaignId } = await params;
    
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify campaign ownership
    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        userId,
      },
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

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Get queue status for this campaign
    const queueStatus = await getCampaignQueueStatus(campaignId);

    // Get event statistics from database
    const eventStats = await prisma.event.groupBy({
      by: ['type'],
      where: {
        campaignId: campaignId
      },
      _count: {
        type: true
      }
    });

    const eventCounts = eventStats.reduce((acc, stat) => {
      acc[stat.type.toLowerCase()] = stat._count.type;
      return acc;
    }, {} as Record<string, number>);

    return NextResponse.json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        queuedAt: campaign.queuedAt,
        sentAt: campaign.sentAt,
        totalSubscribers: campaign.list.subscribers.length,
      },
      queue: queueStatus,
      events: {
        sent: eventCounts.sent || 0,
        delivered: eventCounts.delivered || 0,
        opened: eventCounts.opened || 0,
        clicked: eventCounts.clicked || 0,
        bounced: eventCounts.bounced || 0,
        complained: eventCounts.complained || 0,
        unsubscribed: eventCounts.unsubscribed || 0,
      },
      progress: {
        totalEmails: campaign.list.subscribers.length,
        emailsQueued: queueStatus.emails.total,
        emailsSent: eventCounts.sent || 0,
        emailsFailed: queueStatus.emails.failed,
        percentComplete: campaign.list.subscribers.length > 0 
          ? Math.round(((eventCounts.sent || 0) / campaign.list.subscribers.length) * 100) 
          : 0
      }
    });

  } catch (error) {
    console.error('Error getting campaign status:', error);
    return NextResponse.json(
      { error: 'Failed to get campaign status' },
      { status: 500 }
    );
  }
}