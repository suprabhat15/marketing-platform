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
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10), 200);
    const search = searchParams.get('search') || '';
    const statusFilter = searchParams.get('status') || '';

    // Verify user owns this campaign
    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        userId: session.user.id,
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Build where clause for filtering
    const whereClause: any = { campaignId };
    
    // Add status filter
    if (statusFilter && statusFilter !== 'all') {
      whereClause.type = statusFilter;
    }

    // Add search filter for email or name
    if (search) {
      whereClause.OR = [
        {
          subscriber: {
            email: {
              contains: search,
              mode: 'insensitive'
            }
          }
        },
        {
          subscriber: {
            firstName: {
              contains: search,
              mode: 'insensitive'
            }
          }
        },
        {
          subscriber: {
            lastName: {
              contains: search,
              mode: 'insensitive'
            }
          }
        }
      ];
    }

    // Get total count for pagination
    const totalCount = await prisma.event.count({
      where: whereClause,
    });

    // Calculate pagination
    const totalPages = Math.ceil(totalCount / limit);
    const offset = (page - 1) * limit;

    // Fetch events with pagination
    const events = await prisma.event.findMany({
      where: whereClause,
      include: {
        subscriber: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    });

    return NextResponse.json({
      events,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasMore: page < totalPages,
        hasPrevious: page > 1,
      },
    });
  } catch (error) {
    console.error('Error fetching campaign events:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}