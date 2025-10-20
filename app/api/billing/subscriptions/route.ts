import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Optimize with dynamic imports and caching
async function getAuth() {
  const { auth } = await import('@/lib/auth');
  return auth;
}

async function getPolarSubscriptions() {
  const { getUserSubscriptions, getSubscription, cancelSubscription, updateSubscription } = 
    await import('@/lib/polar-subscriptions');
  return { getUserSubscriptions, getSubscription, cancelSubscription, updateSubscription };
}

async function getPrisma() {
  const { prisma } = await import('@/lib/prisma');
  return prisma;
}

// Cache for subscription data
const subscriptionCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

// Get user's subscriptions
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuth();
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const subscriptionId = searchParams.get('subscriptionId');
    
    // Check cache
    const cacheKey = `sub_${session.user.id}_${subscriptionId || 'all'}`;
    const cached = subscriptionCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json({
        ...cached.data,
        fromCache: true,
      });
    }

    const prisma = await getPrisma();

    if (subscriptionId) {
      // Get specific subscription from database with optimized query
      const subscription = await prisma.subscription.findFirst({
        where: {
          polarSubscriptionId: subscriptionId,
          userId: session.user.id,
        },
      });
      
      if (!subscription) {
        return NextResponse.json(
          { error: 'Subscription not found' },
          { status: 404 }
        );
      }
      
      const result = { subscription };
      subscriptionCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return NextResponse.json(result);
    } else {
      // Get all user subscriptions from database with optimized query
      const subscriptions = await prisma.subscription.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          polarSubscriptionId: true,
          status: true,
          productId: true,
          totalCredits: true,
          usedCredits: true,
          remainingCredits: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          canceledAt: true,
          meterId: true,
          meterName: true,
        },
      });

      // Transform subscriptions to match SubscriptionCard interface
      const transformedSubscriptions = subscriptions.map(sub => ({
        id: sub.polarSubscriptionId,
        status: sub.status.toLowerCase() as 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete',
        product: {
          id: sub.productId || 'unknown',
          name: `${sub.totalCredits.toLocaleString()} Email Credits`,
        },
        price: {
          id: sub.id, // Use our subscription ID as price ID
          amount: 0, // We don't store amount in our schema
          currency: 'USD',
          recurring: {
            interval: 'month' as 'month' | 'year'
          }
        },
        currentPeriodStart: sub.currentPeriodStart?.toISOString() || new Date().toISOString(),
        currentPeriodEnd: sub.currentPeriodEnd?.toISOString() || new Date().toISOString(),
        cancelAtPeriodEnd: !!sub.canceledAt,
        totalCredits: sub.totalCredits,
        usedCredits: sub.usedCredits,
        remainingCredits: sub.remainingCredits,
        meterId: sub.meterId,
        meterName: sub.meterName,
      }));
      
      const result = { subscriptions: transformedSubscriptions };
      subscriptionCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return NextResponse.json(result);
    }

  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subscriptions' },
      { status: 500 }
    );
  }
}

const updateSubscriptionSchema = z.object({
  subscriptionId: z.string().min(1, 'Subscription ID is required'),
  productId: z.string().optional(),
  priceId: z.string().optional(),
  metadata: z.record(z.string()).optional(),
});

// Update subscription
export async function PUT(request: NextRequest) {
  try {
    const auth = await getAuth();
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validatedData = updateSubscriptionSchema.parse(body);

    const { updateSubscription } = await getPolarSubscriptions();
    // Update the subscription
    const updatedSubscription = await updateSubscription(
      validatedData.subscriptionId,
      {
        productId: validatedData.productId,
        priceId: validatedData.priceId,
        metadata: validatedData.metadata,
      }
    );

    return NextResponse.json({
      success: true,
      subscription: updatedSubscription,
    });

  } catch (error) {
    console.error('Error updating subscription:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update subscription' },
      { status: 500 }
    );
  }
}

const cancelSubscriptionSchema = z.object({
  subscriptionId: z.string().min(1, 'Subscription ID is required'),
});

// Cancel subscription
export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAuth();
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validatedData = cancelSubscriptionSchema.parse(body);

    const { cancelSubscription } = await getPolarSubscriptions();
    // Cancel the subscription
    const canceledSubscription = await cancelSubscription(validatedData.subscriptionId);

    return NextResponse.json({
      success: true,
      subscription: canceledSubscription,
      message: 'Subscription canceled successfully',
    });

  } catch (error) {
    console.error('Error canceling subscription:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to cancel subscription' },
      { status: 500 }
    );
  }
}