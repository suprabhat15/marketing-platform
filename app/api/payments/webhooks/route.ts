import { NextRequest, NextResponse } from 'next/server';
import {
  verifyWebhookSignature,
  type PolarWebhookEvent,
  createMeter,
  getOrCreateMeterForProduct,
  getCustomerState,
  extractCreditsFromCustomerState,
} from '@/lib/polar';
import { prisma } from '@/lib/prisma';

// Credit package pricing mapping (should match pricing page)
const CREDIT_PRICING = {
  10000: 10.0,
  // 20000: 20.00,
  // 50000: 50.00,
  // 100000: 100.00,
  // 500000: 500.00,
} as const;

// Product ID to credit mapping (matching auth.ts products)
const PRODUCT_CREDIT_MAPPING = {
  'ee6d8cdb-5dd9-4cdf-b541-c4bdee0a9a7c': 10000, // 10k-Credits
  // '53e8ae14-1bc7-46f4-b5c4-0a5cd87f9f11': 20000,   // 20k-Credits
  // '9ffd8b08-bb25-43f3-aa32-d4f3257a7862': 50000,   // 50k-Credits
  // 'c474152d-b7ba-4083-b1f1-63f23b08e57b': 100000,  // 100k-Credits
  // 'e2d782da-6fae-45da-af5d-8975af1a258a': 500000,  // 500k-Credits
} as const;

// Helper function to get credits and price from product ID
function getCreditsPricing(data: any): { credits: number; price: number } {
  // Get credits from productId mapping
  const credits =
    PRODUCT_CREDIT_MAPPING[
      data.product?.id as keyof typeof PRODUCT_CREDIT_MAPPING
    ] || 0;

  // Get the corresponding price from our pricing table
  const price = CREDIT_PRICING[credits as keyof typeof CREDIT_PRICING] || 0;

  return { credits, price };
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.text();
    // Check WEBHOOK SIGNATURE LATER
    // const signature = request.headers.get('polar-webhook-signature');

    // if (!signature) {
    //   console.error('Missing Polar webhook signature');
    //   return NextResponse.json(
    //     { error: 'Missing webhook signature' },
    //     { status: 400 }
    //   );
    // }

    // Verify webhook signature
    // const isValid = verifyWebhookSignature(payload, signature);
    // if (!isValid) {
    //   console.error('Invalid Polar webhook signature');
    //   return NextResponse.json(
    //     { error: 'Invalid webhook signature' },
    //     { status: 401 }
    //   );
    // }

    const event: PolarWebhookEvent = JSON.parse(payload);
    console.log('Received Polar webhook:', event.type);

    // Process the webhook event
    await handleWebhookEvent(event);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing Polar webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function handleWebhookEvent(event: PolarWebhookEvent) {
  switch (event.type) {
    case 'checkout.created':
      await handleCheckoutCreated(event.data);
      break;

    case 'checkout.updated':
      await handleCheckoutUpdated(event.data);
      break;

    case 'customer.created':
      await handleCustomerCreated(event.data);
      break;

    case 'customer.updated':
      await handleCustomerUpdated(event.data);
      break;

    case 'customer.deleted':
      await handleCustomerDeleted(event.data);
      break;

    case 'customer.state_changed':
      await handleCustomerStateChanged(event.data);
      break;

    case 'subscription.created':
      await handleSubscriptionCreated(event.data);
      break;

    case 'subscription.updated':
      await handleSubscriptionUpdated(event.data);
      break;

    case 'subscription.active':
      await handleSubscriptionActive(event.data);
      break;

    case 'subscription.canceled':
      await handleSubscriptionCanceled(event.data);
      break;

    case 'subscription.uncanceled':
      await handleSubscriptionUncanceled(event.data);
      break;

    case 'subscription.revoked':
      await handleSubscriptionRevoked(event.data);
      break;

    case 'order.created':
      await handleOrderCreated(event.data);
      break;

    case 'order.updated':
      await handleOrderUpdated(event.data);
      break;

    case 'order.paid':
      await handleOrderPaid(event.data);
      break;

    case 'order.refunded':
      await handleOrderRefunded(event.data);
      break;

    case 'refund.created':
      await handleRefundCreated(event.data);
      break;

    case 'refund.updated':
      await handleRefundUpdated(event.data);
      break;

    default:
      console.log('Unhandled webhook event type:', event.type);
  }
}

async function handleCheckoutCreated(data: any) {
  // console.log('Processing checkout.created:', data);
  // Store checkout information if needed
  // You might want to track checkout sessions in your database
}

async function handleCheckoutUpdated(data: any) {
  // console.log('Processing checkout.updated:', data);

  // Handle checkout status updates
  if (data.status === 'completed') {
    // Checkout was completed successfully
    console.log('Checkout completed:', data.id);
  }
}

// Customer event handlers
async function handleCustomerCreated(data: any) {
  console.log('Processing customer.created:', data);

  try {
    const externalId = data.externalId;

    if (externalId) {
      // Update user with Polar customer ID
      await prisma.user.update({
        where: { id: externalId },
        data: {
          polarCustomerId: data.id,
        },
      });
      console.log(`Customer created and linked to user ${externalId}`);
    }
  } catch (error) {
    console.error('Error handling customer.created:', error);
  }
}

async function handleCustomerUpdated(data: any) {
  console.log('Processing customer.updated:', data);

  try {
    const externalId = data.externalId;

    if (externalId) {
      // Sync any customer updates if needed
      console.log(`Customer ${data.id} updated for user ${externalId}`);
    }
  } catch (error) {
    console.error('Error handling customer.updated:', error);
  }
}

async function handleCustomerDeleted(data: any) {
  console.log('Processing customer.deleted:', data);

  try {
    const externalId = data.externalId;

    if (externalId) {
      // Remove Polar customer ID from user
      await prisma.user.update({
        where: { id: externalId },
        data: {
          polarCustomerId: null,
        },
      });
      console.log(`Customer deleted and unlinked from user ${externalId}`);
    }
  } catch (error) {
    console.error('Error handling customer.deleted:', error);
  }
}

async function handleCustomerStateChanged(data: any) {
  console.log('Processing customer.state_changed:', data);

  try {
    const externalId = data.externalId;

    if (externalId) {
      console.log(`Customer state changed for user ${externalId}:`, data.state);
    }
  } catch (error) {
    console.error('Error handling customer.state_changed:', error);
  }
}

// Order event handlers
async function handleOrderCreated(data: any) {
  console.log('Processing order.created:', data);

  try {
    // Extract user information from metadata
    const userId = data.metadata?.userId;
    const userEmail = data.metadata?.userEmail || data.customer?.email;

    if (!userId) {
      console.error('No userId found in order metadata');
      return;
    }

    // Wait 100ms for subscription to be created, then check if it exists
    let subscriptionId = null;
    if (data.subscription_id) {
      await new Promise((resolve) => setTimeout(resolve, 100));

      const existingSubscription = await prisma.subscription.findFirst({
        where: { polarSubscriptionId: data.subscription_id, status: 'ACTIVE' },
      });

      if (existingSubscription) {
        subscriptionId = existingSubscription.id;
      }
    }

    // Get credits and price from pricing table
    const { credits: totalCredits, price: calculatedAmount } =
      getCreditsPricing(data);

    // Create order record in database
    await prisma.order.create({
      data: {
        polarOrderId: data.id,
        customerId: data.customer?.id || data.customerId,
        status: 'PAID',
        productId: data.product?.id,
        amount: calculatedAmount,
        currency: data.currency || 'USD',
        credits: totalCredits,
        userId: userId,
      },
    });

    // Update user's subscription status or permissions
    await updateUserAfterPurchase(userId, {
      orderId: data.id,
      productId: data.product?.id,
      amount: data.amount,
      currency: data.currency,
      status: 'paid',
    });

    console.log(`Order processed successfully for user ${userId}`);
  } catch (error) {
    console.error('Error handling order.created:', error);
  }
}

async function handleOrderUpdated(data: any) {
  // console.log('Processing order.updated:', data);

  try {
    await prisma.order.update({
      where: { polarOrderId: data.id },
      data: {
        status: data.status?.toUpperCase() || 'PENDING',
        amount: data.amount,
        currency: data.currency || 'USD',
      },
    });
    console.log(`Order ${data.id} updated`);
  } catch (error) {
    console.error('Error handling order.updated:', error);
  }
}

async function handleOrderPaid(data: any) {
  console.log('Processing order.paid:', data);

  try {
    const userId = data.metadata?.userId;

    // Update order status to paid
    await prisma.order.update({
      where: { polarOrderId: data.id },
      data: {
        status: 'PAID',
      },
    });

    if (userId) {
      // Activate user's purchased features
      await updateUserAfterPurchase(userId, {
        orderId: data.id,
        productId: data.product?.id,
        amount: data.amount,
        currency: data.currency,
        status: 'paid',
      });
    }

    console.log(`Order ${data.id} marked as paid`);
  } catch (error) {
    console.error('Error handling order.paid:', error);
  }
}

async function handleOrderRefunded(data: any) {
  console.log('Processing order.refunded:', data);

  try {
    await prisma.order.update({
      where: { polarOrderId: data.id },
      data: {
        status: 'REFUNDED',
      },
    });

    const userId = data.metadata?.userId;
    if (userId) {
      // Handle refund logic - remove access, downgrade plan, etc.
      console.log(`Processing refund for user ${userId}, order ${data.id}`);
    }

    console.log(`Order ${data.id} refunded`);
  } catch (error) {
    console.error('Error handling order.refunded:', error);
  }
}

// Subscription event handlers
async function handleSubscriptionCreated(data: any) {
  console.log('Processing subscription.created:', data);

  try {
    const userId = data.customer?.external_id;

    if (!userId) {
      console.error('No external_id found in customer data for subscription');
      return;
    }

    // Get real-time credit information from customer state
    let totalCredits = 0;
    let usedCredits = 0;
    let meterId = null;
    let meterName = null;
    let remainingCredits = 0;

    try {
      // Fetch customer state to get active meters with real credit data
      const customerState = await getCustomerState(userId);
      const creditInfo = extractCreditsFromCustomerState(customerState);
      console.log(
        '---------extractCreditsFromCustomerState---------- ',
        creditInfo
      );

      totalCredits = creditInfo.totalCredits;
      usedCredits = creditInfo.usedCredits;
      remainingCredits = creditInfo.remainingCredits;
      meterId = creditInfo.meterId;

      // Get meter name from benefits if available
      const benefits = data.product?.benefits;
      if (benefits && benefits.length > 0) {
        meterName = benefits[0].properties?.description;
      }

      console.log(
        `✅ Credit tracking from customer state: ${usedCredits}/${totalCredits} credits used, ${remainingCredits} remaining`
      );
    } catch (customerStateError) {
      console.warn(
        '⚠️ Failed to fetch customer state, falling back to pricing table:',
        customerStateError
      );

      // Fallback to pricing table if customer state fetch fails
      const { credits } = getCreditsPricing(data);
      totalCredits = credits;
      usedCredits = 0; // Start with 0 used credits
      remainingCredits = totalCredits - usedCredits;
    }

    // Ensure meter exists for the subscription product
    let createdMeter = null;
    if (!meterId && data.product?.id) {
      try {
        // Use the new getOrCreateMeterForProduct function for better integration
        createdMeter = await getOrCreateMeterForProduct(data.product.id);
        meterId = createdMeter.id;
        meterName = createdMeter.name;
        console.log(`✅ Using meter ${meterId} for subscription ${data.id}`);
      } catch (meterError) {
        console.error('⚠️ Failed to get/create meter:', meterError);
        // Continue without meter for now
      }
    }

    // Create subscription record in database
    await prisma.subscription.create({
      data: {
        polarSubscriptionId: data.id,
        customerId: data.customer?.id || data.customer_id,
        status: data.status?.toUpperCase() || 'ACTIVE',
        productId: data.product?.id || data.product_id,
        totalCredits,
        usedCredits,
        remainingCredits,
        meterId,
        meterName,
        currentPeriodStart: data.current_period_start
          ? new Date(data.current_period_start)
          : new Date(),
        currentPeriodEnd: data.current_period_end
          ? new Date(data.current_period_end)
          : new Date(),
        canceledAt: data.canceled_at ? new Date(data.canceled_at) : null,
        userId,
      },
    });

    // Update user's Polar customer ID if not set
    await prisma.user.update({
      where: { id: userId },
      data: {
        polarCustomerId: data.customer?.id || data.customer_id,
      },
    });

    console.log(
      `Subscription created for user ${userId} with ${remainingCredits} remaining credits`
    );
  } catch (error) {
    console.error('Error handling subscription.created:', error);
  }
}

async function handleSubscriptionUpdated(data: any) {
  // console.log('Processing subscription.updated:', data);

  try {
    const userId = data.customer?.external_id;

    if (!userId) {
      console.error(
        'No external_id found in customer data for subscription update'
      );
      return;
    }

    // Get updated credit information from customer state
    let totalCredits = 0;
    let usedCredits = 0;
    let meterId = null;
    let meterName = null;
    let remainingCredits = 0;

    try {
      // Fetch customer state to get latest active meters data
      const customerState = await getCustomerState(userId);
      const creditInfo = extractCreditsFromCustomerState(customerState);

      totalCredits = creditInfo.totalCredits;
      usedCredits = creditInfo.usedCredits;
      remainingCredits = creditInfo.remainingCredits;
      meterId = creditInfo.meterId;

      console.log(
        `✅ Updated credit tracking from customer state: ${usedCredits}/${totalCredits} credits used, ${remainingCredits} remaining`
      );
    } catch (customerStateError) {
      console.warn(
        '⚠️ Failed to fetch customer state for subscription update:',
        customerStateError
      );

      // Keep existing values or use fallback
      const existingSubscription = await prisma.subscription.findUnique({
        where: { polarSubscriptionId: data.id },
      });

      if (existingSubscription) {
        totalCredits = existingSubscription.totalCredits;
        usedCredits = existingSubscription.usedCredits;
        remainingCredits = existingSubscription.remainingCredits;
        meterId = existingSubscription.meterId;
        meterName = existingSubscription.meterName;
      }
    }

    // Update subscription in database
    await prisma.subscription.update({
      where: { polarSubscriptionId: data.id },
      data: {
        status: data.status?.toUpperCase(),
        productId: data.product?.id || data.product_id,
        totalCredits,
        usedCredits,
        remainingCredits,
        meterId,
        meterName,
        currentPeriodStart: data.current_period_start
          ? new Date(data.current_period_start)
          : undefined,
        currentPeriodEnd: data.current_period_end
          ? new Date(data.current_period_end)
          : undefined,
        canceledAt: data.canceled_at ? new Date(data.canceled_at) : undefined,
      },
    });

    console.log(
      `Subscription updated for user ${userId} with ${remainingCredits} remaining credits`
    );
  } catch (error) {
    console.error('Error handling subscription.updated:', error);
  }
}

async function handleSubscriptionCanceled(data: any) {
  console.log('Processing subscription.canceled:', data);
  
  try {
    const userId = data.metadata?.userId;
    
    if (!userId) {
      console.error('No userId found in subscription metadata');
      return;
    }

    // Update subscription status to canceled
    await prisma.subscription.update({
      where: { polarSubscriptionId: data.id },
      data: {
        status: 'CANCELED',
        canceledAt: data.canceled_at ? new Date(data.canceled_at) : new Date(),
      },
    });

    console.log(`Subscription canceled for user ${userId}`);
    
  } catch (error) {
    console.error('Error handling subscription.canceled:', error);
  }
}

async function handleSubscriptionActive(data: any) {
  console.log('Processing subscription.active:', data);
  
  try {
    await prisma.subscription.update({
      where: { polarSubscriptionId: data.id },
      data: {
        status: 'ACTIVE',
      },
    });
    
    const userId = data.metadata?.userId;
    if (userId) {
      console.log(`Subscription activated for user ${userId}`);
    }
  } catch (error) {
    console.error('Error handling subscription.active:', error);
  }
}

async function handleSubscriptionUncanceled(data: any) {
  console.log('Processing subscription.uncanceled:', data);
  
  try {
    await prisma.subscription.update({
      where: { polarSubscriptionId: data.id },
      data: {
        status: 'ACTIVE',
        canceledAt: data.canceled_at ? new Date(data.canceled_at) : null,
      },
    });
    
    const userId = data.metadata?.userId;
    if (userId) {
      console.log(`Subscription uncanceled for user ${userId}`);
    }
  } catch (error) {
    console.error('Error handling subscription.uncanceled:', error);
  }
}

async function handleSubscriptionRevoked(data: any) {
  console.log('Processing subscription.revoked:', data);
  
  try {
    await prisma.subscription.update({
      where: { polarSubscriptionId: data.id },
      data: {
        status: 'CANCELED',
        canceledAt: new Date(),
      },
    });
    
    const userId = data.metadata?.userId;
    if (userId) {
      console.log(`Subscription revoked for user ${userId}`);
    }
  } catch (error) {
    console.error('Error handling subscription.revoked:', error);
  }
}

// Refund event handlers
async function handleRefundCreated(data: any) {
  console.log('Processing refund.created:', data);
  
  try {
    // You might want to create a refund table to track refunds
    const orderId = data.order?.id;
    
    if (orderId) {
      // Update related order status
      await prisma.order.update({
        where: { polarOrderId: orderId },
        data: {
          status: 'REFUNDED',
        },
      });
      
      console.log(`Refund created for order ${orderId}`);
    }
  } catch (error) {
    console.error('Error handling refund.created:', error);
  }
}

async function handleRefundUpdated(data: any) {
  console.log('Processing refund.updated:', data);
  
  try {
    // Handle refund status updates
    console.log(`Refund ${data.id} updated:`, data.status);
  } catch (error) {
    console.error('Error handling refund.updated:', error);
  }
}

async function updateUserAfterPurchase(userId: string, orderData: any) {
  try {
    // Update user's account with purchase information
    // You might want to:
    // 1. Upgrade their plan
    // 2. Increase their limits
    // 3. Enable premium features
    
    console.log(`Updating user ${userId} after purchase:`, orderData);
    
    // Example: Update user with purchase info
    // await prisma.user.update({
    //   where: { id: userId },
    //   data: {
    //     plan: 'pro', // or determine from productId
    //     lastPurchaseAt: new Date(),
    //   },
    // });
    
  } catch (error) {
    console.error('Error updating user after purchase:', error);
    throw error;
  }
}