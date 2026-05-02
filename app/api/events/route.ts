import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { CreditService } from '@/lib/credit-service';
import { z } from 'zod';
import type { EventType } from '@prisma/client';
import { RedisCache, generateUserCacheKey, invalidateUserCache } from '@/lib/redis-cache';

// Event schema - terminal events (FAILED, BOUNCED, COMPLAINED, SUPPRESSED) are stored in the Event table
// as defined in schema.prisma. These events represent final states of email delivery attempts.
const createEventSchema = z.object({
  type: z.enum(['SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'COMPLAINED', 'FAILED', 'SUPPRESSED', 'UNSUBSCRIBED']),
  campaignId: z.string().optional(),
  subscriberId: z.string().optional(),
  data: z.record(z.any()).optional(),
});

// Create email event and handle credit deduction
export async function POST(request: NextRequest) {
  try {
    // Get user session
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = createEventSchema.parse(body);

    if (validatedData.campaignId) {
      const campaign = await prisma.campaign.findFirst({
        where: { id: validatedData.campaignId, userId: session.user.id },
        select: { id: true },
      });
      if (!campaign) {
        return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
      }
    }

    if (validatedData.subscriberId) {
      const subscriber = await prisma.subscriber.findFirst({
        where: { id: validatedData.subscriberId, list: { userId: session.user.id } },
        select: { id: true },
      });
      if (!subscriber) {
        return NextResponse.json({ error: 'Subscriber not found' }, { status: 404 });
      }
    }

    const event = await prisma.event.create({
      data: {
        type: validatedData.type as EventType,
        data: validatedData.data || {},
        ...(validatedData.campaignId && { campaignId: validatedData.campaignId }),
        ...(validatedData.subscriberId && { subscriberId: validatedData.subscriberId }),
      },
    });

    // Credit deduction is handled automatically by batch-email-processor after successful sends
    // No need to process credits here to avoid double counting

    // Invalidate credit balance cache when events are created (affects balance)
    await invalidateUserCache(session.user.id, 'events-credit-balance');

    return NextResponse.json({
      success: true,
      event,
      message: 'Event created successfully',
    });

  } catch (error) {
    console.error('Error creating event:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create event' },
      { status: 500 }
    );
  }
}

// Get user's credit balance
export async function GET(request: NextRequest) {
  try {
    // Get user session
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check cache first (10 second TTL for credit balance)
    const cacheKey = generateUserCacheKey(session.user.id, 'events-credit-balance');
    const cachedData = await RedisCache.get(cacheKey);
    
    if (cachedData) {
      return NextResponse.json(cachedData);
    }

    const creditBalance = await CreditService.getUserCreditBalance(session.user.id);

    const responseData = {
      success: true,
      creditBalance,
    };

    // Cache the response for 10 seconds
    await RedisCache.set(cacheKey, responseData, { ttl: 10 });

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('Error fetching credit balance:', error);
    return NextResponse.json(
      { error: 'Failed to fetch credit balance' },
      { status: 500 }
    );
  }
}