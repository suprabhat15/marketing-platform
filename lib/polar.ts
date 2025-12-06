import { Polar } from '@polar-sh/sdk';
import crypto from 'crypto';

// Initialize Polar SDK with environment configuration
if (!process.env.POLAR_ACCESS_TOKEN) {
  throw new Error('POLAR_ACCESS_TOKEN environment variable is required');
}

export const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN,
  // server: 'sandbox',
});

// Organization ID for your Polar organization
// export const POLAR_ORGANIZATION_ID_SANDBOX = process.env.POLAR_ORGANIZATION_ID_SANDBOX ?? '';

// Types for checkout session
export interface CheckoutSessionData {
  productId: string;
  successUrl?: string;
  cancelUrl?: string;
  customerEmail?: string;
  customerBillingAddress?: {
    country: string;
  };
  metadata?: Record<string, string | number | boolean>;
  customerId?: string;
  discountId?: string;
  allowDiscountCodes?: boolean;
}

// Types for customer
export interface CreateCustomerData {
  email: string;
  name?: string;
  // metadata?: Record<string, string>;
  userId: string;
}

// Create or get customer
export async function createOrGetCustomer(data: CreateCustomerData) {
  try {
    // Check for existing customer first
    try {
      const selectedCustomer = await polar.customers.getStateExternal({
        externalId: data.userId,
      });
      if (selectedCustomer) return selectedCustomer;
    } catch (getError: any) {
      const { statusCode, error } = getError;

      // If customer not found (404), we'll create a new one
      if (statusCode === 404 || error === 'ResourceNotFound') {
        console.log('Customer not found, will create new one');
      } else {
        // If it's a different error, throw it
        throw getError;
      }
    }

    // Create new customer if not found
    const customer = await polar.customers.create({
      email: data?.email,
      name: data?.name,
      externalId: data?.userId,
      // metadata: data?.metadata,
    });

    return customer;
  } catch (error) {
    console.error('Error creating/getting Polar customer:', error);
    throw new Error('Failed to create or get customer');
  }
}

// Create checkout session with automatic meter initialization
export async function createCheckoutSession(data: CheckoutSessionData) {
  try {
    const productId = data?.productId;
    if (!productId) {
      throw new Error('productId is required for checkout session');
    }
    const checkoutData: any = {
      products: [productId],
    };

    // Automatically ensure meter exists for the product before creating checkout
    try {
      const meterOrBenefit = await getOrCreateMeterForProduct(productId);
      console.log('METER INFOssss ', meterOrBenefit);

      // Extract meter ID from the returned object (could be meter or benefit)
      let meterId = null;

      // If it's a meter object, use its id
      if (meterOrBenefit?.id) {
        meterId = meterOrBenefit.id;
      }
      // // If it's a benefit with meter properties, extract meter_id
      // else if (meterOrBenefit?.properties?.meter_id) {
      //   meterId = meterOrBenefit.properties.meter_id;
      // }
      // // If it's a benefit with meterId property
      // else if (meterOrBenefit?.properties?.meterId) {
      //   meterId = meterOrBenefit.properties.meterId;
      // }

      if (meterId) {
        console.log(
          `✅ Checkout session will use meter ${meterId} for product ${productId}`
        );
      } else {
        console.warn(
          `⚠️ No meter ID found for product ${productId}, proceeding without meter tracking`
        );
      }

      // Add meter reference to metadata for tracking (only if meterId exists)
      const meterMetadata = {
        productId: productId,
        ...(data.metadata || {}),
      };

      // Only add meterId if it's defined
      // if (meterId) {
      //   meterMetadata.meterId = meterId;
      // }

      checkoutData.metadata = meterMetadata;
    } catch (meterError) {
      console.warn(
        `⚠️ Failed to ensure meter for product ${productId}:`,
        meterError
      );
      // Continue with checkout creation even if meter setup fails
      if (data.metadata) checkoutData.metadata = data.metadata;
    }

    // Add optional fields if provided
    if (data.successUrl) checkoutData.successUrl = data.successUrl;
    if (data.cancelUrl) checkoutData.cancel_url = data.cancelUrl;
    if (data.customerEmail) checkoutData.customer_email = data.customerEmail;
    if (data.customerId) checkoutData.customer_id = data.customerId;
    if (data.customerBillingAddress) {
      checkoutData.customer_billing_address = data.customerBillingAddress;
    }
    if (data.discountId) checkoutData.discount_id = data.discountId;
    if (data.allowDiscountCodes !== undefined) {
      checkoutData.allow_discount_codes = data.allowDiscountCodes;
    }

    const session = await polar.checkouts.create(checkoutData);
    return session;
  } catch (error) {
    console.error('Error creating Polar checkout session:', error);
    throw new Error('Failed to create checkout session');
  }
}

// Get product details
export async function getProduct(productId: string) {
  try {
    const product = await polar.products.get({ id: productId });
    return product;
  } catch (error) {
    console.error('Error fetching Polar product:', error);
    throw new Error('Failed to fetch product');
  }
}

// Get product with pricing details
export async function getProductPricing(productId: string) {
  try {
    const product = await polar.products.get({ id: productId });

    // Extract pricing information
    const price = product.prices?.[0];
    if (!price) {
      throw new Error('No pricing information found for product');
    }

    return {
      productId: product.id,
      name: product.name,
      description: product.description,
      price: {
        id: price.id,
        amount: (price as any).amount || 0,
        currency: (price as any).currency || 'USD',
        recurring: (price as any).recurring || null,
      },
      credits: 0,
    };
  } catch (error) {
    console.error('Error fetching product pricing:', error);
    throw new Error('Failed to fetch product pricing');
  }
}

// List all products for an organization
export async function getProducts(organizationId?: string) {
  try {
    const products = await polar.products.list({
      organizationId,
      limit: 100,
    });
    return products;
  } catch (error) {
    console.error('Error fetching Polar products:', error);
    throw new Error('Failed to fetch products');
  }
}

// Fetch credit info from Active Meters using Polar customer meters API
export async function fetchCreditsFromActiveMeters(externalCustomerId: any) {
  let totalCredits = 0;
  let usedCredits = 0;
  let meterId = null;

  console.log(
    '🔍 [DEBUG] Fetching meters for external customer ID:',
    externalCustomerId
  );

  try {
    // Get meters using Polar customer meters API with organizationId filter
    const metersResponse = await polar.customerMeters.list({
      externalCustomerId,
    });
    console.log(
      '🔍 [DEBUG] Meters response received:',
      JSON.stringify(metersResponse, null, 2)
    );
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

          console.log(
            `🔍 [DEBUG] Meter ${i + 1}: ID=${meter.meterId}, credited=${meterCredits}, consumed=${meterUsed}`
          );

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
    console.error('Error fetching customer meters from API:', error);
    // No fallback available - return zero credits if API call fails
    console.log('🔍 [DEBUG] No fallback available, returning zero credits');
  }

  const remainingCredits = totalCredits - usedCredits;

  return {
    totalCredits,
    usedCredits,
    remainingCredits,
    meterId,
    balance: remainingCredits,
  };
}

// Create customer session for customer portal
export async function createCustomerSession(customerId: string) {
  try {
    const session = await polar.customerSessions.create({
      customerId,
    });
    return session;
  } catch (error) {
    console.error('Error creating customer session:', error);
    throw new Error('Failed to create customer session');
  }
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
    const { prisma } = await import('./prisma');
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
        const updateData: any = {
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
            updateData.currentPeriodStart =
              (polarSubscription as any).currentPeriodStart ||
              (polarSubscription as any).current_period_start
                ? new Date(
                    (polarSubscription as any).currentPeriodStart ||
                      (polarSubscription as any).current_period_start
                  )
                : null;
            updateData.currentPeriodEnd =
              (polarSubscription as any).currentPeriodEnd ||
              (polarSubscription as any).current_period_end
                ? new Date(
                    (polarSubscription as any).currentPeriodEnd ||
                      (polarSubscription as any).current_period_end
                  )
                : null;
            updateData.canceledAt =
              (polarSubscription as any).canceledAt ||
              (polarSubscription as any).canceled_at
                ? new Date(
                    (polarSubscription as any).canceledAt ||
                      (polarSubscription as any).canceled_at
                  )
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
    const { prisma } = await import('./prisma');

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

// Update user's credit usage (call this when user consumes credits)
export async function updateCreditUsage(userId: string, creditsUsed: number) {
  try {
    const { prisma } = await import('./prisma');

    // Get user's active subscription or canceled subscription with remaining credits
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        OR: [
          { status: 'ACTIVE' },
          {
            status: 'CANCELED',
            remainingCredits: { gt: 0 }, // Allow canceled subscriptions with remaining credits
          },
        ],
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!subscription) {
      throw new Error(
        'No active subscription or canceled subscription with credits found for user'
      );
    }

    // Check if user has enough credits
    if (subscription.remainingCredits < creditsUsed) {
      throw new Error(
        `Insufficient credits. Need ${creditsUsed}, have ${subscription.remainingCredits}`
      );
    }

    const newUsedCredits = subscription.usedCredits + creditsUsed;
    const newRemainingCredits = subscription.totalCredits - newUsedCredits;

    // Update the subscription with new usage
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        usedCredits: newUsedCredits,
        remainingCredits: newRemainingCredits,
      },
    });

    return {
      totalCredits: subscription.totalCredits,
      usedCredits: newUsedCredits,
      remainingCredits: newRemainingCredits,
    };
  } catch (error) {
    console.error('Error updating credit usage:', error);
    throw new Error('Failed to update credit usage');
  }
}

// Track email credit usage and sync with Polar
export async function trackEmailCreditUsage(
  userId: string,
  emailsSent: number,
  eventId?: string // Optional unique event ID for idempotency
) {
  try {
    const { prisma } = await import('./prisma');

    // Add idempotency check if eventId is provided
    if (eventId) {
      const { getRedisInstance } = await import('./redis');
      const redis = await getRedisInstance();

      const deduplicationKey = `credit_deduction:${userId}:${eventId}`;
      const alreadyProcessed = await redis.get(deduplicationKey);

      if (alreadyProcessed) {
        console.log(
          `⚠️ Credit deduction already processed for event ${eventId}, skipping`
        );
        return JSON.parse(alreadyProcessed);
      }
    }

    // Use the centralized updateCreditUsage function
    const creditResult = await updateCreditUsage(userId, emailsSent);

    // Get the subscription for additional metadata
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        OR: [
          { status: 'ACTIVE' },
          {
            status: 'CANCELED',
            remainingCredits: { gt: 0 },
          },
        ],
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // console.log(
    //   `Tracked ${emailsSent} emails (${emailsSent} credits) for user ${userId}. Remaining: ${creditResult.remainingCredits}/${creditResult.totalCredits}`
    // );

    const result = {
      emailsSent,
      creditsUsed: emailsSent,
      totalCredits: creditResult.totalCredits,
      usedCredits: creditResult.usedCredits,
      remainingCredits: creditResult.remainingCredits,
      hasEnoughCredits: creditResult.remainingCredits >= 0,
    };

    // Cache the result for idempotency (if eventId was provided)
    if (eventId) {
      const { getRedisInstance } = await import('./redis');
      const redis = await getRedisInstance();

      const deduplicationKey = `credit_deduction:${userId}:${eventId}`;
      // Cache for 24 hours
      await redis.setex(deduplicationKey, 24 * 60 * 60, JSON.stringify(result));
    }

    return result;
  } catch (error) {
    console.error('Error tracking email credit usage:', error);
    throw new Error('Failed to track email credit usage');
  }
}

// Check if user has enough credits before sending emails
export async function checkCreditAvailability(
  userId: string,
  emailsToSend: number
) {
  try {
    const creditBalance = await getUserCreditBalanceWithSync(userId, {
      syncFromPolar: false, // Use local data for faster checks
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
  } catch (error) {
    console.error('Error checking credit availability:', error);
    throw new Error('Failed to check credit availability');
  }
}

// Credit package pricing mapping (authoritative source)
export const CREDIT_PRICING = {
  10000: 10.0,
  // 20000: 20.0,
  // 50000: 50.00,
  // 100000: 100.00,
  // 500000: 500.00,
} as const;

// Product ID environment variables
const PRODUCT_ID_10000 = process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID_10K || '';
const PRODUCT_ID_20000 = process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID_20K || '';

// Product ID to credit mapping (matching auth.ts products)
export const PRODUCT_CREDIT_MAPPING = {
  [PRODUCT_ID_10000]: 10000, // 10k-Credits
  [PRODUCT_ID_20000]: 20000, // 20k-Credits
} as const;

// Helper function to get credits and price from product ID
export function getCreditsPricing(data: any): {
  credits: number;
  price: number;
} {
  // Get credits from productId mapping
  const credits =
    PRODUCT_CREDIT_MAPPING[
      data.product?.id as keyof typeof PRODUCT_CREDIT_MAPPING
    ];

  if (!credits) {
    console.error(`Unknown product ID`); // ${data.product?.id}
    throw new Error(`No credit mapping found for product`); // ${data.product?.id}
  }

  // Get the corresponding price from our pricing table
  const price = CREDIT_PRICING[credits as keyof typeof CREDIT_PRICING];

  if (!price) {
    console.error(`No pricing found for ${credits} credits`);
    throw new Error(`No pricing found for ${credits} credits`);
  }
  return { credits, price };
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


// Process webhook events
export interface PolarWebhookEvent {
  type: string;
  data: any;
}
