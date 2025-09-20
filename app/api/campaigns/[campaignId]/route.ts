import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    
    if (!session?.user?.id) {
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

    // Get event counts by type
    const eventCounts = await prisma.event.groupBy({
      by: ['type'],
      where: { campaignId },
      _count: { type: true }
    });

    const eventsByType = eventCounts.reduce((acc, event) => {
      acc[event.type] = event._count.type;
      return acc;
    }, {} as Record<string, number>);

    return NextResponse.json({ 
      campaign: {
        ...campaign,
        eventsByType,
        totalEvents: campaign._count.events,
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

    if (!session) {
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

    await prisma.campaign.delete({
      where: {
        id: campaignId,
        userId: session?.user.id,
      },
    });

    return NextResponse.json({ message: 'Campaign deleted successfully' });
  } catch (error) {
    console.error('Error deleting campaign:', error);
    return NextResponse.json(
      { error: 'Failed to delete campaign' },
      { status: 500 }
    );
  }
}