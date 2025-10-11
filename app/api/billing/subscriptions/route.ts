import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getUserSubscriptions, getSubscription, cancelSubscription, updateSubscription } from '@/lib/polar-subscriptions';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

// Get user's subscriptions
export async function GET(request: NextRequest) {
  try {
    // Get user session
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

    if (subscriptionId) {
      // Get specific subscription from database
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
      
      return NextResponse.json({ subscription });
    } else {
      // Get all user subscriptions from database
      const subscriptions = await prisma.subscription.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'desc' },
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
      
      return NextResponse.json({ subscriptions: transformedSubscriptions });
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
    // Get user session
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
    // Get user session
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