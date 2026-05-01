import { polar, PRODUCT_CREDIT_MAPPING } from './polar-client';
import { prisma } from '@/lib/prisma';
import { getRedisInstance } from '@/lib/redis';
import { getCreditBalance } from '@/lib/credit-ledger.service';

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

// Combined function to get user credit balance and sync with Polar in one flow
export async function getUserCreditBalanceWithSync(
  userId: string,
  options: {
    syncFromPolar?: boolean;
    updateSubscriptionStatus?: boolean;
    polarSubscriptionId?: string;
  } = {}
) {
  try {
    const {
      syncFromPolar = true,
      updateSubscriptionStatus = false,
      polarSubscriptionId,
    } = options;

    // Get user's active subscription with credit tracking
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId: userId,
        status: 'ACTIVE',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!subscription) {
      return {
        totalCredits: 0,
        usedCredits: 0,
        remainingCredits: 0,
        hasActiveSubscription: false,
      };
    }

    // Get real-time credit data from Polar customer state API
    if (syncFromPolar) {
      try {
        const creditInfo = await fetchCreditsFromActiveMeters(userId);

        // Prepare update data
        const updateData: Record<string, unknown> = {
          totalCredits: creditInfo.totalCredits,
          usedCredits: creditInfo.usedCredits,
          remainingCredits: creditInfo.remainingCredits,
          meterId: creditInfo.meterId,
        };

        // If we need to update subscription status and have polarSubscriptionId
        if (updateSubscriptionStatus && polarSubscriptionId) {
          try {
            const polarSubscription = await polar.subscriptions.get({
              id: polarSubscriptionId,
            });

            updateData.status = polarSubscription.status?.toUpperCase();
            updateData.currentPeriodStart = polarSubscription.currentPeriodStart
              ? new Date(polarSubscription.currentPeriodStart)
              : null;
            updateData.currentPeriodEnd = polarSubscription.currentPeriodEnd
              ? new Date(polarSubscription.currentPeriodEnd)
              : null;
            updateData.canceledAt = polarSubscription.canceledAt
              ? new Date(polarSubscription.canceledAt)
              : null;
          } catch (polarError) {
            console.warn(
              '⚠️ Failed to fetch Polar subscription details:',
              polarError
            );
            // Continue with credit sync even if subscription status update fails
          }
        }

        // Update local subscription with fresh data
        if (
          creditInfo.totalCredits > 0 ||
          creditInfo.usedCredits > 0 ||
          updateSubscriptionStatus
        ) {
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: updateData,
          });

          // Mirror Polar's authoritative credit values into the local CreditBalance cache.
          await prisma.creditBalance.upsert({
            where: { userId },
            create: {
              userId,
              totalCredits: creditInfo.totalCredits,
              usedCredits: creditInfo.usedCredits,
              remainingCredits: creditInfo.remainingCredits,
            },
            update: {
              totalCredits: creditInfo.totalCredits,
              usedCredits: creditInfo.usedCredits,
              remainingCredits: creditInfo.remainingCredits,
            },
          });

          console.log(
            `✅ Updated local subscription with customer state data: ${creditInfo.usedCredits}/${creditInfo.totalCredits} credits`
          );
        }

        return {
          totalCredits: creditInfo.totalCredits,
          usedCredits: creditInfo.usedCredits,
          remainingCredits: creditInfo.remainingCredits,
          hasActiveSubscription: true,
          subscriptionId: subscription.id,
          polarSubscriptionId: subscription.polarSubscriptionId,
          meterId: creditInfo.meterId,
          meterName: subscription.meterName,
          balance: creditInfo.balance,
        };
      } catch (error) {
        console.warn(
          '⚠️ Failed to fetch customer state, using local data:',
          error
        );
        // Fall back to local data if customer state fetch fails
      }
    }

    // Return local subscription data as fallback
    return {
      totalCredits: subscription.totalCredits,
      usedCredits: subscription.usedCredits,
      remainingCredits: subscription.remainingCredits,
      hasActiveSubscription: true,
      subscriptionId: subscription.id,
      polarSubscriptionId: subscription.polarSubscriptionId,
      meterId: subscription.meterId,
      meterName: subscription.meterName,
    };
  } catch (error) {
    console.error('Error fetching user credit balance:', error);
    throw new Error('Failed to fetch credit balance');
  }
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

// Check if user has enough credits before sending emails
// Uses CreditBalance for fast reads
export async function checkCreditAvailability(
  userId: string,
  emailsToSend: number
) {
  try {
    // Fast read from CreditBalance table
    const balance = await getCreditBalance(userId);

    if (!balance) {
      // Fallback to subscription-based check if no CreditBalance exists
      const creditBalance = await getUserCreditBalanceWithSync(userId, {
        syncFromPolar: false,
        updateSubscriptionStatus: false,
      });

      if (!creditBalance.hasActiveSubscription) {
        return {
          hasEnoughCredits: false,
          availableCredits: 0,
          requiredCredits: emailsToSend,
          message: 'No active subscription found',
        };
      }

      const hasEnoughCredits = creditBalance.remainingCredits >= emailsToSend;

      return {
        hasEnoughCredits,
        availableCredits: creditBalance.remainingCredits,
        requiredCredits: emailsToSend,
        message: hasEnoughCredits
          ? 'Sufficient credits available'
          : `Insufficient credits. Need ${emailsToSend}, have ${creditBalance.remainingCredits}`,
      };
    }

    // Use CreditBalance for fast read
    const hasEnoughCredits = balance.remainingCredits >= emailsToSend;

    return {
      hasEnoughCredits,
      availableCredits: balance.remainingCredits,
      requiredCredits: emailsToSend,
      message: hasEnoughCredits
        ? 'Sufficient credits available'
        : `Insufficient credits. Need ${emailsToSend}, have ${balance.remainingCredits}`,
    };
  } catch (error) {
    console.error('Error checking credit availability:', error);
    throw new Error('Failed to check credit availability');
  }
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
