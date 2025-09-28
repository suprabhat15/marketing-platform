import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createCampaignSchema } from '@/lib/validators';
import { ZodError } from 'zod';

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const campaigns = await prisma.campaign.findMany({
      where: { userId: session?.user.id },
      include: {
        list: true,
        template: true,
        events: {
          include: {
            subscriber: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            events: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Group campaigns by name (keeping campaign name unique)
    const groupedCampaigns = campaigns.reduce((acc, campaign) => {
      const existingGroup = acc.find(group => group.name === campaign.name);
      
      if (existingGroup) {
        // Merge events from campaigns with same name
        existingGroup.events.push(...campaign.events);
        existingGroup.totalEvents += campaign._count.events;
        existingGroup.campaignIds.push(campaign.id);
        // Update dates if this campaign is newer
        if (campaign.createdAt > existingGroup.latestCreatedAt) {
          existingGroup.latestCreatedAt = campaign.createdAt;
          existingGroup.latestStatus = campaign.status;
        }
      } else {
        // Create new group
        acc.push({
          id: campaign.id,
          name: campaign.name,
          subject: campaign.subject,
          content: campaign.content,
          status: campaign.status,
          latestStatus: campaign.status,
          scheduledAt: campaign.scheduledAt,
          sentAt: campaign.sentAt,
          createdAt: campaign.createdAt,
          latestCreatedAt: campaign.createdAt,
          list: campaign.list,
          template: campaign.template,
          events: campaign.events,
          totalEvents: campaign._count.events,
          campaignIds: [campaign.id],
          // Group event counts by type for easy access
          eventsByType: campaign.events.reduce((eventAcc, event) => {
            eventAcc[event.type] = (eventAcc[event.type] || 0) + 1;
            return eventAcc;
          }, {} as Record<string, number>),
        });
      }
      
      return acc;
    }, [] as Array<{
      id: string;
      name: string;
      subject: string;
      content: string;
      status: string;
      latestStatus: string;
      scheduledAt: Date | null;
      sentAt: Date | null;
      createdAt: Date;
      latestCreatedAt: Date;
      list: any;
      template: any;
      events: any[];
      totalEvents: number;
      campaignIds: string[];
      eventsByType: Record<string, number>;
    }>);

    // Recalculate eventsByType for merged campaigns
    groupedCampaigns.forEach(group => {
      group.eventsByType = group.events.reduce((eventAcc: Record<string, number>, event: any) => {
        eventAcc[event.type] = (eventAcc[event.type] || 0) + 1;
        return eventAcc;
      }, {} as Record<string, number>);
    });

    // Sort by latest activity
    groupedCampaigns.sort((a, b) => 
      new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime()
    );

    // Calculate overall stats
    const stats = {
      total: groupedCampaigns.length,
      sent: groupedCampaigns.filter(c => c.latestStatus === 'SENT').length,
      scheduled: groupedCampaigns.filter(c => c.latestStatus === 'SCHEDULED').length,
      draft: groupedCampaigns.filter(c => c.latestStatus === 'DRAFT').length,
      totalEvents: groupedCampaigns.reduce((sum, c) => sum + c.totalEvents, 0),
    };

    // Available event types for frontend filtering
    const availableEventTypes = ['SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'COMPLAINED', 'UNSUBSCRIBED'];

    return NextResponse.json({ 
      campaigns: groupedCampaigns, 
      stats,
      availableEventTypes
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
// Create a campaign
export async function POST(request: NextRequest) { // Created first campaign via seed.ts
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, subject, content, listId, templateId, scheduledAt, subscriberIds, fromEmail, fromName, replyTo } =
      createCampaignSchema.parse(body);
      
    // Verify list ownership
    const list = await prisma.list.findFirst({
      where: {
        id: listId,
        userId: session?.user.id,
      },
    });

    if (!list) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    const campaign = await prisma.campaign.create({
      data: {
        name,
        subject,
        content,
        listId,
        templateId,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
        subscriberIds: subscriberIds,
        userId: session?.user.id,
        fromEmail,
        fromName,
        replyTo
      },
    });

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
}