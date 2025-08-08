import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const importSubscribersSchema = z.object({
  subscribers: z.array(z.object({
    email: z.string().email('Invalid email address'),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    status: z.enum(['ACTIVE', 'UNSUBSCRIBED']).optional(),
  })),
});

// GET /api/lists/[listId]/subscribers - Get subscribers for a list with pagination
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { listId } = await params;
    const { searchParams } = new URL(request.url);
    
    // Parse pagination parameters
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25')));
    const skip = (page - 1) * limit;
    
    // Parse filters
    const search = searchParams.get('search')?.trim() || '';
    const status = searchParams.get('status') || '';
    
    // Build where clause
    const where: any = { listId };
    
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }
    
    if (status && status !== 'all') {
      where.status = status;
    }

    // Get total count for pagination metadata
    const totalCount = await prisma.subscriber.count({ where });
    
    // Fetch subscribers with pagination
    const subscribers = await prisma.subscriber.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(totalCount / limit);
    const hasMore = page < totalPages;

    return NextResponse.json({ 
      subscribers,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasMore,
        hasPrevious: page > 1,
      }
    });
  } catch (error) {
    console.error('Error fetching subscribers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subscribers' },
      { status: 500 }
    );
  }
}

// POST /api/lists/[listId]/subscribers - Add new subscribers to a list
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { listId } = await params;
    const body = await request.json();
    const { subscribers } = importSubscribersSchema.parse(body);

    // Check if list exists
    const list = await prisma.list.findUnique({
      where: { id: listId },
    });

    if (!list) {
      return NextResponse.json(
        { error: 'List not found' },
        { status: 404 }
      );
    }

    // Get existing subscribers to avoid duplicates
    const existingSubscribers = await prisma.subscriber.findMany({
      where: { listId },
      select: { email: true },
    });

    const existingEmails = new Set(existingSubscribers.map(s => s.email));
    const newSubscribers = subscribers.filter(s => !existingEmails.has(s.email));

    if (newSubscribers.length === 0) {
      return NextResponse.json({
        message: 'No new subscribers to import',
        imported: 0,
        duplicates: subscribers.length,
      });
    }

    // Create new subscribers
    const createdSubscribers = await prisma.subscriber.createMany({
      data: newSubscribers.map(subscriber => ({
        email: subscriber.email,
        firstName: subscriber.firstName || '',
        lastName: subscriber.lastName || '',
        status: subscriber.status === 'UNSUBSCRIBED' ? 'UNSUBSCRIBED' : 'ACTIVE',
        listId,
      })),
    });

    return NextResponse.json({
      message: 'Subscribers imported successfully',
      imported: createdSubscribers.count,
      duplicates: subscribers.length - newSubscribers.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error importing subscribers:', error);
    return NextResponse.json(
      { error: 'Failed to import subscribers' },
      { status: 500 }
    );
  }
}