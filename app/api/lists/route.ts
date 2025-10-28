import { NextRequest, NextResponse } from 'next/server';
import { createListSchema, paginationSchema } from '@/lib/validators';
import { ZodError } from 'zod';
import { RedisCache, generateUserCacheKey, invalidateUserCache } from '@/lib/redis-cache';

// Use full auth instead of auth-lite
async function getPrisma() {
  const { prisma } = await import('@/lib/prisma');
  return prisma;
}

async function getAuth() {
  const { auth } = await import('@/lib/auth');
  return auth;
}

// GET /api/lists - Get all lists for the authenticated user with pagination
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuth();
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse pagination parameters from query string
    const { searchParams } = new URL(request.url);
    const { page, limit } = paginationSchema.parse({
      page: searchParams.get('page'),
      limit: searchParams.get('limit'),
    });

    // Create cache key with pagination params
    const cacheKey = generateUserCacheKey(session.user.id, 'lists', `page:${page}-limit:${limit}`);
    const cachedData = await RedisCache.get(cacheKey);
    
    if (cachedData) {
      return NextResponse.json(cachedData);
    }

    const prisma = await getPrisma();

    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    // Get total count for pagination metadata
    const totalCount = await prisma.list.count({
      where: { userId: session.user.id },
    });

    // Optimize query - only fetch status stats, not full subscriber data
    const lists = await prisma.list.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { subscribers: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    });

    // Optimize: Use single query to get all status counts at once
    const listIds = lists.map((list) => list.id);
    const allStatusCounts = await prisma.subscriber.groupBy({
      where: { listId: { in: listIds } },
      by: ['listId', 'status'],
      _count: { status: true },
    });

    // Group status counts by listId for efficient lookup
    const statusCountsByListId = allStatusCounts.reduce(
      (acc, { listId, status, _count }) => {
        if (!acc[listId]) acc[listId] = [];
        acc[listId].push({ status, count: _count.status });
        return acc;
      },
      {} as Record<string, Array<{ status: string; count: number }>>
    );

    // Map lists with their status counts
    const listsWithStats = lists.map((list) => ({
      ...list,
      subscribers: statusCountsByListId[list.id] || [],
    }));

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    const responseData = {
      lists: listsWithStats,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      },
    };

    // Cache the response for 1 minute
    await RedisCache.set(cacheKey, responseData, { ttl: 60 });

    return NextResponse.json(responseData);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Invalid pagination parameters', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error fetching lists:', error);
    return NextResponse.json(
      { error: 'Failed to fetch lists' },
      { status: 500 }
    );
  }
}

// POST /api/lists - Create a new list
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, subscribers } = createListSchema.parse(body);

    const auth = await getAuth();
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const prisma = await getPrisma();
    const list = await prisma.list.create({
      data: {
        name,
        description: description || '',
        userId: session.user.id,
        subscribers: subscribers
          ? {
              create: subscribers.map((subscriber) => ({
                email: subscriber.email,
                firstName: subscriber.firstName || '',
                lastName: subscriber.lastName || '',
                status:
                  subscriber.status === 'UNSUBSCRIBED'
                    ? 'UNSUBSCRIBED'
                    : 'ACTIVE',
              })),
            }
          : undefined,
      },
      include: {
        _count: {
          select: { subscribers: true },
        },
      },
    });

    // Invalidate lists cache for this user
    await invalidateUserCache(session.user.id, 'lists');

    return NextResponse.json({ list }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error creating list:', error);
    return NextResponse.json(
      { error: 'Failed to create list' },
      { status: 500 }
    );
  }
}