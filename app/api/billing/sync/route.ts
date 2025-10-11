import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { syncSubscriptionFromPolar, getUserCreditBalance } from '@/lib/polar';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const syncSubscriptionSchema = z.object({
  subscriptionId: z.string().optional(),
  syncAll: z.boolean().default(false),
});

// Sync subscription data from Polar API
export async function POST(request: NextRequest) {
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
    const validatedData = syncSubscriptionSchema.parse(body);

    if (validatedData.subscriptionId) {
      // Sync specific subscription
      const syncedSubscription = await syncSubscriptionFromPolar(validatedData.subscriptionId);
      
      return NextResponse.json({
        success: true,
        subscription: syncedSubscription,
        message: 'Subscription synced successfully',
      });
    } else if (validatedData.syncAll) {
      // Sync all user's active subscriptions
      const userSubscriptions = await prisma.subscription.findMany({
        where: {
          userId: session.user.id,
          status: 'ACTIVE',
        },
      });

      const syncResults = [];
      for (const subscription of userSubscriptions) {
        try {
          const synced = await syncSubscriptionFromPolar(subscription.polarSubscriptionId);
          syncResults.push({ 
            id: subscription.polarSubscriptionId, 
            status: 'synced',
            credits: {
              total: synced.totalCredits,
              used: synced.usedCredits,
              remaining: synced.remainingCredits
            }
          });
        } catch (error) {
          syncResults.push({ 
            id: subscription.polarSubscriptionId, 
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      return NextResponse.json({
        success: true,
        syncResults,
        message: `Synced ${syncResults.filter(r => r.status === 'synced').length} of ${syncResults.length} subscriptions`,
      });
    } else {
      // Get user's current credit balance with sync
      const creditBalance = await getUserCreditBalance(session.user.id, true);
      
      return NextResponse.json({
        success: true,
        creditBalance,
        message: 'Credit balance refreshed from Polar',
      });
    }

  } catch (error) {
    console.error('Error syncing subscription data:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to sync subscription data' },
      { status: 500 }
    );
  }
}

// Get current sync status and credit balance
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

    // Get user's current credit balance (without syncing)
    const creditBalance = await getUserCreditBalance(session.user.id, false);
    
    // Get all user subscriptions with their sync status
    const subscriptions = await prisma.subscription.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        polarSubscriptionId: true,
        status: true,
        totalCredits: true,
        usedCredits: true,
        remainingCredits: true,
        meterId: true,
        meterName: true,
        updatedAt: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
      },
    });

    return NextResponse.json({
      creditBalance,
      subscriptions,
      lastSyncAt: subscriptions[0]?.updatedAt || null,
    });

  } catch (error) {
    console.error('Error fetching sync status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sync status' },
      { status: 500 }
    );
  }
}