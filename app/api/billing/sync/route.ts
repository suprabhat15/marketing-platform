import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Optimize with dynamic imports and caching
async function getAuth() {
  const { auth } = await import('@/lib/auth');
  return auth;
}

async function getPolar() {
  const { syncSubscriptionFromPolar, getUserCreditBalance } = await import('@/lib/polar');
  return { syncSubscriptionFromPolar, getUserCreditBalance };
}

async function getPrisma() {
  const { prisma } = await import('@/lib/prisma');
  return prisma;
}

const syncSubscriptionSchema = z.object({
  subscriptionId: z.string().optional(),
  syncAll: z.boolean().default(false),
});

// Cache for recent sync results to avoid redundant API calls
const syncCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Sync subscription data from Polar API
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuth();
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = syncSubscriptionSchema.parse(body);
    const { syncSubscriptionFromPolar, getUserCreditBalance } = await getPolar();

    // Check cache for recent sync
    const cacheKey = `sync_${session.user.id}_${validatedData.subscriptionId || 'all'}`;
    const cached = syncCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json({
        ...cached.data,
        fromCache: true,
      });
    }

    if (validatedData.subscriptionId) {
      // Sync specific subscription
      const syncedSubscription = await syncSubscriptionFromPolar(validatedData.subscriptionId);
      
      const result = {
        success: true,
        subscription: syncedSubscription,
        message: 'Subscription synced successfully',
      };

      // Cache the result
      syncCache.set(cacheKey, { data: result, timestamp: Date.now() });

      return NextResponse.json(result);
    } else if (validatedData.syncAll) {
      const prisma = await getPrisma();
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
          const synced = await syncSubscriptionFromPolar(
            subscription.polarSubscriptionId
          );
          syncResults.push({
            id: subscription.polarSubscriptionId, 
            status: 'synced',
            credits: {
              total: synced.totalCredits,
              used: synced.usedCredits,
              remaining: synced.remainingCredits,
            }
          });
        } catch (error) {
          syncResults.push({ 
            id: subscription.polarSubscriptionId,
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      const result = {
        success: true,
        syncResults,
        message: `Synced ${syncResults.filter(r => r.status === 'synced').length} of ${syncResults.length} subscriptions`,
      };

      // Cache the result
      syncCache.set(cacheKey, { data: result, timestamp: Date.now() });

      return NextResponse.json(result);
    } else {
      // Get user's current credit balance with sync
      const creditBalance = await getUserCreditBalance(session.user.id, true);

      const result = {
        success: true,
        creditBalance,
        message: 'Credit balance refreshed from Polar',
      };

      // Cache the result
      syncCache.set(cacheKey, { data: result, timestamp: Date.now() });

      return NextResponse.json(result);
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
    const auth = await getAuth();
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check cache for recent GET request
    const getCacheKey = `get_${session.user.id}`;
    const cached = syncCache.get(getCacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json({
        ...cached.data,
        fromCache: true,
      });
    }

    const { getUserCreditBalance } = await getPolar();
    const prisma = await getPrisma();

    // Get user's current credit balance (without syncing)
    const creditBalance = await getUserCreditBalance(session.user.id, false);

    // Get all user subscriptions with their sync status (optimized query)
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

    const result = {
      creditBalance,
      subscriptions,
      lastSyncAt: subscriptions[0]?.updatedAt || null,
    };

    // Cache the result
    syncCache.set(getCacheKey, { data: result, timestamp: Date.now() });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching sync status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sync status' },
      { status: 500 }
    );
  }
}