import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createTemplateSchema, paginationSchema } from '@/lib/validators';
import { ZodError } from 'zod';
import { RedisCache, generateUserCacheKey, invalidateUserCache } from '@/lib/redis-cache';

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse pagination parameters from query string
    const { searchParams } = new URL(request.url);
    const { page, limit } = paginationSchema.parse({
      page: searchParams.get('page'),
      limit: searchParams.get('limit'),
    });

    // Create cache key with pagination params
    const cacheKey = generateUserCacheKey(session.user.id, 'templates', `page:${page}-limit:${limit}`);
    const cachedData = await RedisCache.get(cacheKey);
    
    if (cachedData) {
      return NextResponse.json(cachedData);
    }

    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    // Get total count for pagination metadata
    const totalCount = await prisma.template.count({
      where: { userId: session.user.id },
    });

    const templates = await prisma.template.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    const responseData = {
      templates,
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

    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, subject, content, attachments } = createTemplateSchema.parse(body);

    const template = await prisma.template.create({
      data: {
        name,
        subject,
        content,
        attachments: attachments || [],
        userId: session.user.id,
      },
    });

    // Invalidate templates cache for this user
    await invalidateUserCache(session.user.id, 'templates');

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}