import { polar, PRODUCT_CREDIT_MAPPING } from './polar-client';
import { prisma } from '@/lib/prisma';
import { getRedisInstance } from '@/lib/redis';
import {
  readCreditBalance,
  reconcileMeterUsage,
} from '@/lib/credit-balance.service';

const POLAR_METER_CACHE_TTL_SECONDS = 10;
const polarMeterCacheKey = (externalCustomerId: string) =>
  `polar:meters:${externalCustomerId}`;

export async function invalidatePolarMeterCache(externalCustomerId: string) {
  try {
    const redis = getRedisInstance();
    await redis.del(polarMeterCacheKey(externalCustomerId));
  } catch (error) {
    console.warn('⚠️ Failed to invalidate Polar meter cache:', error);
  }
}

// Fetch credit info from Active Meters using Polar customer meters API.
// Cached for POLAR_METER_CACHE_TTL_SECONDS to protect Polar from refresh-spam.
export async function fetchCreditsFromActiveMeters(externalCustomerId: string) {
  const cacheKey = polarMeterCacheKey(String(externalCustomerId));
  const redis = getRedisInstance();

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (error) {
    console.warn('⚠️ Polar meter cache read failed, falling through:', error);
  }

  let totalCredits = 0;
  let usedCredits = 0;
  let meterId = null;

  try {
    // Get meters using Polar customer meters API with organizationId filter
    const metersResponse = await polar.customerMeters.list({
      externalCustomerId,
    });

    let meterCount = 0;

    // Iterate through paginated response
    for await (const response of metersResponse) {
      if (response.result?.items && response.result.items.length > 0) {
        meterCount += response.result.items.length;

        // Sum up all meters for total credits
        for (let i = 0; i < response.result.items.length; i++) {
          const meter = response.result.items[i];
          const meterCredits = meter.creditedUnits || 0;
          const meterUsed = meter.consumedUnits || 0;

          totalCredits += meterCredits;
          usedCredits += meterUsed;

          // Use the first meter ID for tracking
          if (!meterId) {
            meterId = meter.meterId;
          }
        }
      }
    }

    if (meterCount > 0) {
      console.log(
        `🔍 [DEBUG] After summing ${meterCount} meters: total=${totalCredits}, used=${usedCredits}`
      );
    } else {
      console.log('🔍 [DEBUG] No meters found');
    }
  } catch (error) {
    throw new Error('Failed to fetch customer meters from Polar API');
  }

  const remainingCredits = totalCredits - usedCredits;
  const result = {
    totalCredits,
    usedCredits,
    remainingCredits,
    meterId,
    balance: remainingCredits,
  };

  try {
    await redis.set(
      cacheKey,
      JSON.stringify(result),
      'EX',
      POLAR_METER_CACHE_TTL_SECONDS
    );
  } catch (error) {
    console.warn('⚠️ Polar meter cache write failed:', error);
  }

  return result;
}

// Local allocations and send debits are authoritative. Refresh Polar for
// comparison/status only; meter counters cannot charge the same send again.
export async function getUserCreditBalanceWithSync(
  userId: string,
  options: {
    syncFromPolar?: boolean;
    updateSubscriptionStatus?: boolean;
    polarSubscriptionId?: string;
  } = {}
) {
  const {
    syncFromPolar = true,
    updateSubscriptionStatus = false,
    polarSubscriptionId,
  } = options;
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      ...(polarSubscriptionId
        ? { polarSubscriptionId }
        : { status: 'ACTIVE' as const }),
    },
    orderBy: { createdAt: 'desc' },
  });
  let hasActiveSubscription = subscription?.status === 'ACTIVE';
  if (updateSubscriptionStatus && polarSubscriptionId) {
    if (!subscription) throw new Error('Subscription not found for this user');
    const remote = await polar.subscriptions.get({ id: polarSubscriptionId });
    const { billingWebhookService } = await import('./polar-webhook.service');
    await billingWebhookService.syncSubscription(remote);
    hasActiveSubscription = remote.status === 'active';
  }
  let polarComparison: {
    totalCredits: number;
    usedCredits: number;
    remainingCredits: number;
  } | null = null;
  let usageSync: string = 'not_requested';
  if (syncFromPolar) {
    // Fetch failures propagate: a requested synchronization must not claim
    // success when it only returned a stale local value.
    const meter = await fetchCreditsFromActiveMeters(userId);
    polarComparison = {
      totalCredits: meter.totalCredits,
      usedCredits: meter.usedCredits,
      remainingCredits: meter.remainingCredits,
    };
    usageSync = (await reconcileMeterUsage(userId, meter.usedCredits)).outcome;
  }
  const balance = await readCreditBalance(userId);
  return {
    ...balance,
    hasActiveSubscription,
    subscriptionId: subscription?.id,
    polarSubscriptionId: subscription?.polarSubscriptionId,
    meterId: subscription?.meterId,
    meterName: subscription?.meterName,
    balance: balance.remainingCredits,
    polarComparison,
    usageSync,
  };
}

// Updated syncSubscriptionFromPolar to use the combined function
export async function syncSubscriptionFromPolar(polarSubscriptionId: string) {
  try {
    // Get the subscription record to find the user ID
    const localSubscription = await prisma.subscription.findUnique({
      where: { polarSubscriptionId },
    });

    if (!localSubscription) {
      throw new Error(
        `Local subscription not found for Polar subscription ${polarSubscriptionId}`
      );
    }

    // Use the combined function to sync credits and subscription status
    const result = await getUserCreditBalanceWithSync(
      localSubscription.userId,
      {
        syncFromPolar: true,
        updateSubscriptionStatus: true,
        polarSubscriptionId,
      }
    );

    console.log(
      `✅ Subscription ${polarSubscriptionId} synced: ${result.usedCredits}/${result.totalCredits} credits used`
    );

    return result;
  } catch (error) {
    console.error('Error syncing subscription from Polar:', error);
    throw new Error('Failed to sync subscription');
  }
}

// Keep the original getUserCreditBalance for backward compatibility
export async function getUserCreditBalance(
  userId: string,
  syncFromPolar: boolean = true
) {
  return getUserCreditBalanceWithSync(userId, { syncFromPolar });
}

// Campaigns and batches use the same user-level balance, including one-time
// purchases and retained credits after subscription cancellation.
export async function checkCreditAvailability(
  userId: string,
  emailsToSend: number
) {
  if (!Number.isSafeInteger(emailsToSend) || emailsToSend < 0)
    throw new Error('Invalid recipient count');
  const balance = await readCreditBalance(userId);
  const hasEnoughCredits = balance.remainingCredits >= emailsToSend;
  return {
    hasEnoughCredits,
    availableCredits: balance.remainingCredits,
    requiredCredits: emailsToSend,
    message: hasEnoughCredits
      ? 'Sufficient credits available'
      : `Insufficient credits. Need ${emailsToSend}, have ${balance.remainingCredits}`,
  };
}

// Get or create meter for product
export async function getOrCreateMeterForProduct(productId: string) {
  try {
    // First, try to find existing meter for this product
    const product = await polar.products.get({ id: productId });
    const benefit = product.benefits[0];

    if (!benefit) {
      throw new Error(`No benefits found for product ${productId}`);
    }

    // If the benefit has an id that refers to a meter, use that
    if (benefit.id) {
      try {
        const meter = await polar.meters.get({ id: benefit.id });
        return meter;
      } catch {
        // If benefit.id is not a meter, return the benefit as fallback
        return benefit;
      }
    }

    return benefit;
  } catch (error) {
    console.error('Error getting or creating meter for product:', error);
    throw new Error(`Failed to get or create meter for product ${productId}`);
  }
}

// Initialize meters for all products
export async function initializeAllProductMeters() {
  try {
    const results = [];

    for (const productId of Object.keys(PRODUCT_CREDIT_MAPPING)) {
      try {
        const meter = await getOrCreateMeterForProduct(productId);
        results.push({
          productId,
          meterId: meter.id,
          success: true,
          credits:
            PRODUCT_CREDIT_MAPPING[
              productId as keyof typeof PRODUCT_CREDIT_MAPPING
            ],
        });
      } catch (error) {
        console.error(
          `Failed to initialize meter for product ${productId}:`,
          error
        );
        results.push({
          productId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    console.log('Meter initialization results:', results);
    return results;
  } catch (error) {
    console.error('Error initializing product meters:', error);
    throw new Error('Failed to initialize product meters');
  }
}

// Create meter for subscription based on product credits (legacy function - kept for backward compatibility)
export async function createMeter(subscriptionId: string, productId: string) {
  try {
    // Use the new getOrCreateMeterForProduct function
    const meter = await getOrCreateMeterForProduct(productId);

    console.log(`Using meter ${meter.id} for subscription ${subscriptionId}`);
    return meter;
  } catch (error) {
    console.error('Error creating meter:', error);
    throw new Error('Failed to create meter');
  }
}

// Get meter details
export async function getMeter(meterId: string) {
  try {
    const meter = await polar.meters.get({ id: meterId });
    return meter;
  } catch (error) {
    console.error('Error fetching meter:', error);
    throw new Error('Failed to fetch meter');
  }
}
