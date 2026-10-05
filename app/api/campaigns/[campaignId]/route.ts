import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { batchQueue } from '@/lib/queue-client';
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
      omit: { userId: true, listId: true, templateId: true, subscriberIds: true },
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

    // Read-through: Redis first (real-time), then campaign_stats table (post-TTL fallback)
    let eventsByType: Record<string, number> = {};
    let totalEvents = 0;
    let statsSource: 'redis' | 'db' | 'none' = 'none';

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
        const count = parseInt(values[index] || '0', 10);
        if (eventType === 'total') {
          totalEvents = count;
        } else {
          eventsByType[eventType.toUpperCase()] = count;
        }
      });

      if (!totalEvents) {
        totalEvents = Object.values(eventsByType).reduce((sum, c) => sum + c, 0);
      }
      statsSource = 'redis';
    }

    if (statsSource === 'none') {
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
          rejected: true,
          renderFailed: true,
          totalEvents: true,
          lastSyncAt: true,
        }
      });

      if (campaignStats) {
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
          REJECTED: campaignStats.rejected,
          RENDER_FAILED: campaignStats.renderFailed,
        };
        totalEvents = campaignStats.totalEvents;
        statsSource = 'db';
      }
    }

    // Event table is authoritative — merge to correct stale Redis/campaignStats counters
    const eventCountRows = await prisma.event.groupBy({
      by: ['type'],
      where: { campaignId },
      _count: { _all: true },
    });
    if (eventCountRows.length > 0) {
      for (const row of eventCountRows) {
        eventsByType[row.type] = Math.max(eventsByType[row.type] ?? 0, row._count._all);
      }
      const dbTotal = eventCountRows.reduce((sum, r) => sum + r._count._all, 0);
      totalEvents = Math.max(totalEvents, dbTotal);
    }

    // Events for engagement chart (OPENED/CLICKED in first 24h after send)
    const chartEventsRaw = await prisma.event.findMany({
      where: {
        campaignId,
        type: { in: ['OPENED', 'CLICKED'] },
        ...(campaign.sentAt
          ? {
              createdAt: {
                gte: campaign.sentAt,
                lte: new Date(campaign.sentAt.getTime() + 24 * 60 * 60 * 1000),
              },
            }
          : {}),
      },
      select: { type: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 5000,
    });

    // Failed delivery events (BOUNCED, COMPLAINED) with subscriber info
    const failedDeliveryEvents = await prisma.event.findMany({
      where: { campaignId, type: { in: ['BOUNCED', 'COMPLAINED', 'FAILED'] } },
      select: {
        type: true,
        createdAt: true,
        subscriber: { select: { email: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    // Unsubscribed events with subscriber info
    const unsubscribedEvents = await prisma.event.findMany({
      where: { campaignId, type: 'UNSUBSCRIBED' },
      select: {
        createdAt: true,
        subscriber: { select: { email: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    return NextResponse.json({
      campaign: {
        ...campaign,
        eventsByType,
        totalEvents,
        subscriberCount: campaign.list._count.subscribers,
        chartEvents: chartEventsRaw.map((e) => ({
          type: e.type,
          createdAt: e.createdAt.toISOString(),
        })),
        failedDeliveries: failedDeliveryEvents.map((e) => ({
          type: e.type,
          createdAt: e.createdAt.toISOString(),
          email: e.subscriber?.email ?? null,
          name:
            [e.subscriber?.firstName, e.subscriber?.lastName]
              .filter(Boolean)
              .join(' ') || null,
        })),
        unsubscribedContacts: unsubscribedEvents.map((e) => ({
          createdAt: e.createdAt.toISOString(),
          email: e.subscriber?.email ?? null,
          name:
            [e.subscriber?.firstName, e.subscriber?.lastName]
              .filter(Boolean)
              .join(' ') || null,
        })),
      },
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

    const existingCampaign = await prisma.campaign.findFirst({
      where: { id: campaignId, userId: session.user.id },
    });

    if (!existingCampaign) {
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