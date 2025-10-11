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

// Create checkout session
export async function createCheckoutSession(data: CheckoutSessionData) {
  try {
    const checkoutData: any = {
      products: [data.productId || process.env.POLAR_PRODUCT_ID_SANDBOX || '1234567890'],
    };

    // Add optional fields if provided
    if (data.successUrl) checkoutData.success_url = data.successUrl;
    if (data.cancelUrl) checkoutData.cancel_url = data.cancelUrl;
    if (data.customerEmail) checkoutData.customer_email = data.customerEmail;
    if (data.customerId) checkoutData.customer_id = data.customerId;
    if (data.customerBillingAddress) {
      checkoutData.customer_billing_address = data.customerBillingAddress;
    }
    if (data.metadata) checkoutData.metadata = data.metadata;
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
        canceledAt: new Date()
      }
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

// Sync subscription data from Polar API to local database
export async function syncSubscriptionFromPolar(polarSubscriptionId: string) {
  try {
    const { prisma } = await import('./prisma');
    
    // Get subscription from Polar
    const polarSubscription = await polar.subscriptions.get({ id: polarSubscriptionId });
    
    // Extract credit information from meters
    let totalCredits = 0;
    let usedCredits = 0;
    let meterId = null;
    let meterName = null;

    if (polarSubscription.meters && polarSubscription.meters.length > 0) {
      const firstMeter = polarSubscription.meters[0];
      totalCredits = (firstMeter as any).creditedUnits || (firstMeter as any).credited_units || 0;
      usedCredits = (firstMeter as any).consumedUnits || (firstMeter as any).consumed_units || 0;
      meterId = (firstMeter as any).meterId || (firstMeter as any).meter_id;
      meterName = firstMeter.meter?.name;
    }

    const remainingCredits = totalCredits - usedCredits;

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
        currentPeriodStart: (polarSubscription as any).currentPeriodStart || (polarSubscription as any).current_period_start ? new Date((polarSubscription as any).currentPeriodStart || (polarSubscription as any).current_period_start) : null,
        currentPeriodEnd: (polarSubscription as any).currentPeriodEnd || (polarSubscription as any).current_period_end ? new Date((polarSubscription as any).currentPeriodEnd || (polarSubscription as any).current_period_end) : null,
        canceledAt: (polarSubscription as any).canceledAt || (polarSubscription as any).canceled_at ? new Date((polarSubscription as any).canceledAt || (polarSubscription as any).canceled_at) : null,
      },
    });

    console.log(`Subscription ${polarSubscriptionId} synced: ${usedCredits}/${totalCredits} credits used`);
    return updatedSubscription;
  } catch (error) {
    console.error('Error syncing subscription from Polar:', error);
    throw new Error('Failed to sync subscription');
  }
}

// Get user's credit balance from their active subscription
export async function getUserCreditBalance(userId: string, syncFromPolar: boolean = false) {
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

    // Optionally sync from Polar to get latest data
    let syncedSubscription = subscription;
    if (syncFromPolar && subscription.polarSubscriptionId) {
      try {
        syncedSubscription = await syncSubscriptionFromPolar(subscription.polarSubscriptionId);
      } catch (error) {
        console.warn('Failed to sync from Polar, using local data:', error);
      }
    }

    return {
      totalCredits: syncedSubscription.totalCredits,
      usedCredits: syncedSubscription.usedCredits,
      remainingCredits: syncedSubscription.remainingCredits,
      hasActiveSubscription: true,
      subscriptionId: syncedSubscription.id,
      polarSubscriptionId: syncedSubscription.polarSubscriptionId,
      meterId: syncedSubscription.meterId,
      meterName: syncedSubscription.meterName,
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

    return response;
  } catch (error) {
    console.error('Error ingesting event to Polar:', error);
    throw new Error('Failed to ingest event');
  }
}

// Process webhook events
export interface PolarWebhookEvent {
  type: string;
  data: any;
}
