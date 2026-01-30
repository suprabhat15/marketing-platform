import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { batchQueue } from '@/lib/queue';
import { invalidateUserCache } from '@/lib/redis-cache';
import { redis } from '@/lib/redis';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { campaignId } = await params;

    // Fetch campaign details with related data
    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        userId: session.user.id,
      },
      include: {
        list: {
          select: {
            id: true,
            name: true,
            _count: {
              select: { subscribers: { where: { status: 'ACTIVE' } } }
            }
          }
        },
        template: {
          select: {
            id: true,
            name: true,
            html: true,
            content: true,
          }
        },
        _count: {
          select: { events: true }
        }
      }
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Get aggregated event stats from database (with Redis fallback)
    let eventsByType: Record<string, number> = {};
    let totalEvents = 0;

    // Try to get stats from database first
    const campaignStats = await prisma.campaignStats.findUnique({
      where: { campaignId },
      select: {
        sent: true,
        delivered: true,
        opened: true,
        clicked: true,
        bounced: true,
        complained: true,
        failed: true,
        suppressed: true,
        unsubscribed: true,
        totalEvents: true,
        lastSyncAt: true,
      }
    });

    if (campaignStats) {
      // Use database stats
      eventsByType = {
        SENT: campaignStats.sent,
        DELIVERED: campaignStats.delivered,
        OPENED: campaignStats.opened,
        CLICKED: campaignStats.clicked,
        BOUNCED: campaignStats.bounced,
        COMPLAINED: campaignStats.complained,
        FAILED: campaignStats.failed,
        SUPPRESSED: campaignStats.suppressed,
        UNSUBSCRIBED: campaignStats.unsubscribed,
      };
      totalEvents = campaignStats.totalEvents;
    } else {
      // Fallback to Redis if no database stats
      const campaignKeys: string[] = [];
      let cursor = '0';
      do {
        const [nextCursor, batch] = await redis.scan(
          cursor,
          'MATCH',
          `campaign_stats:${campaignId}:*`,
          'COUNT',
          500
        );
        cursor = nextCursor;
        campaignKeys.push(...batch);
      } while (cursor !== '0');

      if (campaignKeys.length > 0) {
        const values = await redis.mget(...campaignKeys);
        campaignKeys.forEach((key, index) => {
          const eventType = key.replace(`campaign_stats:${campaignId}:`, '');
          if (eventType !== 'total') {
            eventsByType[eventType.toUpperCase()] = parseInt(
              values[index] || '0'
            );
          }
        });
        
        // Calculate total from Redis stats
        totalEvents = Object.values(eventsByType).reduce((sum, count) => sum + count, 0);
      }
    }

    return NextResponse.json({ 
      campaign: {
        ...campaign,
        eventsByType,
        totalEvents,
        subscriberCount: campaign.list._count.subscribers
      }
    });
  } catch (error) {
    console.error('Error fetching campaign:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    // Check if campaign exists
    const existingTemplate = await prisma.campaign.findUnique({
      where: { id: campaignId }
    });

    if (!existingTemplate) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }

    // Cancel any pending queue jobs for this campaign
    try {
      const pendingJobs = await batchQueue.getJobs([
        'waiting',
        'delayed',
        'active',
      ]);
      const campaignJobs = pendingJobs.filter(job => job.data.campaignId === campaignId);
      
      for (const job of campaignJobs) {
        await job.remove();
      }
      
      const pendingBatchJobs = await batchQueue.getJobs(['waiting', 'delayed', 'active']);
      const batchCampaignJobs = pendingBatchJobs.filter(job => job.data.campaignId === campaignId);
      
      for (const job of batchCampaignJobs) {
        await job.remove();
      }
      
      console.log(`Cancelled ${campaignJobs.length + batchCampaignJobs.length} queue jobs for campaign ${campaignId}`);
    } catch (queueError) {
      console.error('Error cancelling queue jobs:', queueError);
    }

    await prisma.campaign.delete({
      where: {
        id: campaignId,
        userId: session.user.id,
      },
    });

    // Invalidate campaigns cache for this user
    await invalidateUserCache(session.user.id, 'campaigns');

    return NextResponse.json({ message: 'Campaign deleted successfully' });
  } catch (error) {
    console.error('Error deleting campaign:', error);
    return NextResponse.json(
      { error: 'Failed to delete campaign' },
      { status: 500 }
    );
  }
}