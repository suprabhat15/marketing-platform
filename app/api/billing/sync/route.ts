import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { RedisCache, generateUserCacheKey } from '@/lib/redis-cache';

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

// Cache TTL for sync results (5 minutes)
const CACHE_TTL = 5 * 60; // 5 minutes in seconds for Redis

// Sync subscription data from Polar API
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuth();
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = syncSubscriptionSchema.parse(body);
    const { syncSubscriptionFromPolar, getUserCreditBalance } = await getPolar();

    // Check Redis cache for recent sync
    const cacheKey = generateUserCacheKey(
      session.user.id,
      'billing-sync',
      validatedData.subscriptionId || 'all'
    );
    const statusCacheKey = generateUserCacheKey(session.user.id, 'billing-status');

    // Invalidate the GET cache so a page refresh sees fresh data post-sync
    const invalidateStatusCache = async () => {
      try {
        await RedisCache.del(statusCacheKey);
      } catch (cacheError) {
        console.warn('Redis cache invalidation failed:', cacheError);
      }
    };

    if (validatedData.subscriptionId) {
      const prisma = await getPrisma();
      
      // Verify subscription belongs to user
      const subscription = await prisma.subscription.findFirst({
        where: {
          polarSubscriptionId: validatedData.subscriptionId,
          userId: session.user.id,
        },
      });
      
      if (!subscription) {
        return NextResponse.json(
          { error: 'Subscription not found or access denied' },
          { status: 403 }
        );
      }
      
      // Sync specific subscription
      const syncedSubscription = await syncSubscriptionFromPolar(validatedData.subscriptionId);
      
      const result = {
        success: true,
        subscription: syncedSubscription,
        message: 'Subscription synced successfully',
      };

      try {
        await RedisCache.set(cacheKey, result, { ttl: CACHE_TTL });
      } catch (cacheError) {
        console.warn('Redis cache write failed:', cacheError);
      }
      await invalidateStatusCache();

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

      // Cache the result in Redis (fail silently if Redis is down)
      const syncResults = await Promise.all(
        userSubscriptions.map(async (subscription: any) => {
          try {
            const synced = await syncSubscriptionFromPolar(
              subscription.polarSubscriptionId
            );
            return {
              id: subscription.polarSubscriptionId,
              status: 'synced' as const,
              credits: {
                total: synced.totalCredits,
                used: synced.usedCredits,
                remaining: synced.remainingCredits,
              },
            };
          } catch (error) {
            return {
              id: subscription.polarSubscriptionId,
              status: 'error' as const,
              error: error instanceof Error ? error.message : 'Unknown error',
            };
          }
        })
      );

      const result = {
        success: true,
        syncResults,
        message: `Synced ${syncResults.filter((r) => r.status === 'synced').length} of ${syncResults.length} subscriptions`,
      };

      // Cache the result in Redis (fail silently if Redis is down)
      try {
        await RedisCache.set(cacheKey, result, { ttl: CACHE_TTL });
      } catch (cacheError) {
        console.warn('Redis cache write failed:', cacheError);
      }
      await invalidateStatusCache();

      return NextResponse.json(result);
    } else {
      // Get user's current credit balance with sync
      const creditBalance = await getUserCreditBalance(session.user.id, true);

      const result = {
        success: true,
        creditBalance,
        message: 'Credit balance refreshed from Polar',
      };

      // Cache the result in Redis (fail silently if Redis is down)
      try {
        await RedisCache.set(cacheKey, result, { ttl: CACHE_TTL });
      } catch (cacheError) {
        console.warn('Redis cache write failed:', cacheError);
      }
      await invalidateStatusCache();

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

    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check Redis cache for recent GET request
    const getCacheKey = generateUserCacheKey(session.user.id, 'billing-status');

    try {
      const cached = await RedisCache.get(getCacheKey);
      if (cached) {
        return NextResponse.json({
          ...cached,
          fromCache: true,
        });
      }
    } catch (cacheError) {
      console.warn(
        'Redis cache read failed, proceeding without cache:',
        cacheError
      );
      // Continue without cache if Redis fails
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
      lastSyncAt:
        subscriptions.length > 0
          ? subscriptions.reduce(
              (latest: any, sub: any) =>
                !latest || sub.updatedAt > latest ? sub.updatedAt : latest,
              null as Date | null
            )
          : null,
    };

    // Cache the result in Redis
    await RedisCache.set(getCacheKey, result, { ttl: CACHE_TTL });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching sync status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sync status' },
      { status: 500 }
    );
  }
}