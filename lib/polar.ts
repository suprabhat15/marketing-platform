import { Polar } from '@polar-sh/sdk';
import crypto from 'crypto';

// Initialize Polar SDK with environment configuration
export const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN_SANDBOX ?? "",
  server: 'sandbox',
});

// Organization ID for your Polar organization
// export const POLAR_ORGANIZATION_ID_SANDBOX = process.env.POLAR_ORGANIZATION_ID_SANDBOX ?? '';

// Types for checkout session
export interface CheckoutSessionData {
  productId?: string;
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
    console.log("--------- checking for existing customer --------- ", data);
    
    try {
      const selectedCustomer = await polar.customers.getStateExternal({
        externalId: data.userId,
      });
      
      console.log("--------- found existing customer --------- ", selectedCustomer);
      if(selectedCustomer) return selectedCustomer;
    } catch (getError: any) {
      const { statusCode, error} = getError;

      // If customer not found (404), we'll create a new one
      if (statusCode === 404 || error === 'ResourceNotFound') {
        console.log("Customer not found, will create new one");
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
    const productId =
      data.productId || process.env.POLAR_PRODUCT_ID_SANDBOX || '1234567890';

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
      if (meterOrBenefit?.id && meterOrBenefit?.name) {
        meterId = meterOrBenefit.id;
      }
      // If it's a benefit with meter properties, extract meter_id
      else if (meterOrBenefit?.properties?.meter_id) {
        meterId = meterOrBenefit.properties.meter_id;
      }
      // If it's a benefit with meterId property
      else if (meterOrBenefit?.properties?.meterId) {
        meterId = meterOrBenefit.properties.meterId;
      }

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
      if (meterId) {
        meterMetadata.meterId = meterId;
      }
      
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
    if (data.successUrl) checkoutData.success_url = data.successUrl;
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
      credits: extractCreditsFromProduct(product.name),
    };
  } catch (error) {
    console.error('Error fetching product pricing:', error);
    throw new Error('Failed to fetch product pricing');
  }
}

// Helper function to extract credits from product name
function extractCreditsFromProduct(productName: string): number {
  const match = productName.match(/(\d+)k/i);
  if (match) {
    return parseInt(match[1]) * 1000;
  }
  return 0;
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

// Get subscription details
export async function getSubscription(subscriptionId: string) {
  try {
    const subscription = await polar.subscriptions.get({ id: subscriptionId });
    return subscription;
  } catch (error) {
    console.error('Error fetching Polar subscription:', error);
    throw new Error('Failed to fetch subscription');
  }
}

// Cancel subscription (placeholder - implement based on Polar API)
export async function cancelSubscription(subscriptionId: string) {
  try {
    // TODO: Implement actual subscription cancellation
    // For now, just log the cancellation request
    console.log(`Cancellation requested for subscription: ${subscriptionId}`);

    // Update our database to mark as cancelled
    const { prisma } = await import('./prisma');
    const subscription = await prisma.subscription.update({
      where: { polarSubscriptionId: subscriptionId },
      data: {
        status: 'CANCELED',
        canceledAt: new Date(),
      },
    });

    return subscription;
  } catch (error) {
    console.error('Error canceling Polar subscription:', error);
    throw new Error('Failed to cancel subscription');
  }
}

// Webhook signature verification (updated to match Polar's format)
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string = process.env.POLAR_WEBHOOK_SECRET!
): boolean {
  // Remove 'sha256=' prefix if present
  const cleanSignature = signature.replace('sha256=', '');

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(cleanSignature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}

// Get customer state with active meters for credit tracking
export async function getCustomerState(externalId: string) {
  try {
    const customerState = await polar.customers.getStateExternal({
      externalId,
    });
    return customerState;
  } catch (error) {
    console.error('Error fetching customer state:', error);
    throw new Error('Failed to fetch customer state');
  }
}

// Extract credit information from customer state activeMeters
export function extractCreditsFromCustomerState(customerState: any) {
  let totalCredits = 0;
  let usedCredits = 0;
  let meterId = null;

  if (customerState.activeMeters && customerState.activeMeters.length > 0) {
    // Sum up all active meters for total credits
    for (const activeMeter of customerState.activeMeters) {
      totalCredits += activeMeter.creditedUnits || 0;
      usedCredits += activeMeter.consumedUnits || 0;

      // Use the first meter ID for tracking
      if (!meterId) {
        meterId = activeMeter.meterId;
      }
    }
  }

  const remainingCredits = totalCredits - usedCredits;

  return {
    totalCredits,
    usedCredits,
    remainingCredits,
    meterId,
    balance: customerState.activeMeters?.[0]?.balance || remainingCredits,
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

// Sync subscription data from Polar API using customer state for accurate credit data
export async function syncSubscriptionFromPolar(polarSubscriptionId: string) {
  try {
    const { prisma } = await import('./prisma');

    // Get subscription from Polar
    const polarSubscription = await polar.subscriptions.get({
      id: polarSubscriptionId,
    });

    // Get the subscription record to find the user ID
    const localSubscription = await prisma.subscription.findUnique({
      where: { polarSubscriptionId },
    });

    if (!localSubscription) {
      throw new Error(
        `Local subscription not found for Polar subscription ${polarSubscriptionId}`
      );
    }

    // Get real-time credit information from customer state
    let totalCredits = 0;
    let usedCredits = 0;
    let meterId = null;
    let meterName = null;
    let remainingCredits = 0;

    try {
      const customerState = await getCustomerState(localSubscription.userId);
      const creditInfo = extractCreditsFromCustomerState(customerState);

      totalCredits = creditInfo.totalCredits;
      usedCredits = creditInfo.usedCredits;
      remainingCredits = creditInfo.remainingCredits;
      meterId = creditInfo.meterId;

      console.log(
        `✅ Syncing subscription ${polarSubscriptionId} with customer state data: ${usedCredits}/${totalCredits} credits`
      );
    } catch (customerStateError) {
      console.warn(
        '⚠️ Failed to fetch customer state during sync, keeping existing values:',
        customerStateError
      );

      // Keep existing credit values if customer state fetch fails
      totalCredits = localSubscription.totalCredits;
      usedCredits = localSubscription.usedCredits;
      remainingCredits = localSubscription.remainingCredits;
      meterId = localSubscription.meterId;
      meterName = localSubscription.meterName;
    }

    // Update local subscription record
    const updatedSubscription = await prisma.subscription.update({
      where: { polarSubscriptionId },
      data: {
        status: polarSubscription.status?.toUpperCase() as any,
        totalCredits,
        usedCredits,
        remainingCredits,
        meterId,
        meterName,
        currentPeriodStart:
          (polarSubscription as any).currentPeriodStart ||
          (polarSubscription as any).current_period_start
            ? new Date(
                (polarSubscription as any).currentPeriodStart ||
                  (polarSubscription as any).current_period_start
              )
            : null,
        currentPeriodEnd:
          (polarSubscription as any).currentPeriodEnd ||
          (polarSubscription as any).current_period_end
            ? new Date(
                (polarSubscription as any).currentPeriodEnd ||
                  (polarSubscription as any).current_period_end
              )
            : null,
        canceledAt:
          (polarSubscription as any).canceledAt ||
          (polarSubscription as any).canceled_at
            ? new Date(
                (polarSubscription as any).canceledAt ||
                  (polarSubscription as any).canceled_at
              )
            : null,
      },
    });

    console.log(
      `✅ Subscription ${polarSubscriptionId} synced: ${usedCredits}/${totalCredits} credits used`
    );
    return updatedSubscription;
  } catch (error) {
    console.error('Error syncing subscription from Polar:', error);
    throw new Error('Failed to sync subscription');
  }
}

// Get user's credit balance using customer state API for real-time data
export async function getUserCreditBalance(
  userId: string,
  syncFromPolar: boolean = true
) {
  try {
    const { prisma } = await import('./prisma');

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
        const customerState = await getCustomerState(userId);
        const creditInfo = extractCreditsFromCustomerState(customerState);

        // Update local subscription with fresh data
        if (creditInfo.totalCredits > 0 || creditInfo.usedCredits > 0) {
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: {
              totalCredits: creditInfo.totalCredits,
              usedCredits: creditInfo.usedCredits,
              remainingCredits: creditInfo.remainingCredits,
              meterId: creditInfo.meterId,
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

// Update user's credit usage (call this when user consumes credits)
export async function updateCreditUsage(userId: string, creditsUsed: number) {
  try {
    const { prisma } = await import('./prisma');

    // Get user's active subscription
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
      throw new Error('No active subscription found for user');
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

// Ingest events to Polar for usage tracking
export async function ingestEvent(event: {
  name: string;
  externalCustomerId: string;
  timestamp?: Date;
  metadata?: Record<string, any>;
}) {
  try {
    const eventData = {
      name: event.name,
      externalCustomerId: event.externalCustomerId,
      timestamp: event.timestamp || new Date(),
      ...(event.metadata && { metadata: event.metadata }),
    };

    const response = await polar.events.ingest({
      events: [eventData],
    });

    console.log(`✅ [POLAR INGEST] SUCCESS:`, {
      eventName: event.name,
      customerId: event.externalCustomerId,
      response: response
        ? JSON.stringify(response, null, 2)
        : 'No response data',
      timestamp: new Date().toISOString(),
    });

    return response;
  } catch (error) {
    console.error(`❌ [POLAR INGEST] FAILED:`, {
      eventName: event.name,
      customerId: event.externalCustomerId,
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
            }
          : error,
      timestamp: new Date().toISOString(),
    });
    throw new Error(
      `Failed to ingest event: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// Track email credit usage and sync with Polar
export async function trackEmailCreditUsage(
  userId: string,
  emailsSent: number
) {
  try {
    const { prisma } = await import('./prisma');

    // Get user's active subscription
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
      throw new Error('No active subscription found for user');
    }

    // Update local credit usage
    const creditsToDeduct = emailsSent; // 1 credit per email
    const newUsedCredits = subscription.usedCredits + creditsToDeduct;
    const newRemainingCredits = subscription.totalCredits - newUsedCredits;

    // Update subscription in local database
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        usedCredits: newUsedCredits,
        remainingCredits: newRemainingCredits,
      },
    });

    // Ingest event to Polar for usage tracking
    await ingestEvent({
      name: 'SENT',
      externalCustomerId: userId,
      metadata: {
        emailsSent: emailsSent,
        creditsUsed: creditsToDeduct,
        totalUsedCredits: newUsedCredits,
        remainingCredits: newRemainingCredits,
        subscriptionId: subscription.polarSubscriptionId,
      },
    });

    console.log(
      `Tracked ${emailsSent} emails (${creditsToDeduct} credits) for user ${userId}. Remaining: ${newRemainingCredits}/${subscription.totalCredits}`
    );

    return {
      emailsSent,
      creditsUsed: creditsToDeduct,
      totalCredits: subscription.totalCredits,
      usedCredits: newUsedCredits,
      remainingCredits: newRemainingCredits,
      hasEnoughCredits: newRemainingCredits >= 0,
    };
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
    const creditBalance = await getUserCreditBalance(userId);

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

// Product to credit mapping (centralized)
export const PRODUCT_CREDIT_MAPPING = {
  '21f0fc55-39e4-4bd8-9f68-99858cc613a4': 10000, // 10k-Credits
  '53e8ae14-1bc7-46f4-b5c4-0a5cd87f9f11': 20000, // 20k-Credits
  '9ffd8b08-bb25-43f3-aa32-d4f3257a7862': 50000, // 50k-Credits
  'c474152d-b7ba-4083-b1f1-63f23b08e57b': 100000, // 100k-Credits
  'e2d782da-6fae-45da-af5d-8975af1a258a': 500000, // 500k-Credits
} as const;

// Create meter for a specific product (used during initial setup)
// export async function createMeterForProduct(productId: string) {
//   try {
//     const credits =
//       PRODUCT_CREDIT_MAPPING[productId as keyof typeof PRODUCT_CREDIT_MAPPING];

//     if (!credits) {
//       throw new Error(`No credit mapping found for product ${productId}`);
//     }

//     const meter = await polar.meters.create({
//       name: `email-credits-${credits}`,
//       filter: {
//         conjunction: 'and',
//         clauses: [
//           {
//             key: 'product_id',
//             operation: 'equals',
//             value: productId,
//           },
//           {
//             key: 'event_name',
//             operation: 'equals',
//             value: 'email_sent',
//           },
//         ],
//       },
//       aggregation: {
//         func: 'count',
//       },
//       metadata: {
//         productId,
//         maxCredits: credits.toString(),
//         creditType: 'email_credits',
//         description: `Email credit meter for ${credits} credits package`,
//       },
//     });

//     console.log(
//       `Created meter ${meter.id} for product ${productId} with ${credits} credits`
//     );
//     return meter;
//   } catch (error) {
//     console.error('Error creating meter for product:', error);
//     throw new Error(`Failed to create meter for product ${productId}`);
//   }
// }

// Get or create meter for product
export async function getOrCreateMeterForProduct(productId: string) {
  try {
    // First, try to find existing meter for this product
    const product = await polar.products.get({ id: productId });
    const benefit = product.benefits[0];

    if (!benefit) {
      throw new Error(`No benefits found for product ${productId}`);
    }

    // If the benefit has a meter_id in properties, fetch the actual meter
    if (benefit.properties?.meterId) {
      const meter = await polar.meters.get({ id: benefit.properties.meterId });
      return meter;
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

// Update meter consumption when credits are used
// export async function consumeMeterCredits(
//   userId: string,
//   creditsToConsume: number = 1
// ) {
//   try {
//     // Get customer state to find active meters
//     const customerState = await getCustomerState(userId);

//     if (
//       !customerState.activeMeters ||
//       customerState.activeMeters.length === 0
//     ) {
//       throw new Error(`No active meters found for user ${userId}`);
//     }

//     // Use the first active meter (assuming single meter per customer for now)
//     const activeMeter = customerState.activeMeters[1];
//     const newConsumedUnits = activeMeter.consumedUnits + creditsToConsume;
//     const newBalance = activeMeter.creditedUnits - newConsumedUnits;

//     console.log(
//       `🔄 [METER UPDATE] Consuming ${creditsToConsume} credits from meter:`,
//       {
//         meterId: activeMeter.meterId,
//         currentConsumed: activeMeter.consumedUnits,
//         newConsumed: newConsumedUnits,
//         credited: activeMeter.creditedUnits,
//         newBalance: newBalance,
//         userId,
//       }
//     );

//     // Update the meter with new consumption
//     const updatedMeter = await polar.meters.update({
//       id: activeMeter.meterId,
//       meterUpdate: {
//         metadata: {
//           consumedAmount: newConsumedUnits,
//         },
//       },
//     });

//     console.log(
//       `✅ [METER UPDATE] Successfully updated meter ${activeMeter.meterId} for user ${userId}`
//     );
//     return updatedMeter;
//   } catch (error) {
//     console.error(
//       `❌ [METER UPDATE] Failed to consume credits for user ${userId}:`,
//       error
//     );
//     throw new Error(
//       `Failed to consume meter credits: ${error instanceof Error ? error.message : 'Unknown error'}`
//     );
//   }
// }

// Update meter (e.g., to reset credits for new billing period)
// export async function updateMeter(
//   meterId: string,
//   updates: {
//     creditedAmount?: number;
//     consumedAmount?: number;
//   }
// ) {
//   try {
//     const meter = await polar.meters.update({
//       id: meterId,
//       meterUpdate: updates,
//     });

//     console.log(`Updated meter ${meterId}:`, updates);
//     return meter;
//   } catch (error) {
//     console.error('Error updating meter:', error);
//     throw new Error('Failed to update meter');
//   }
// }

// Process webhook events
export interface PolarWebhookEvent {
  type: string;
  data: any;
}
