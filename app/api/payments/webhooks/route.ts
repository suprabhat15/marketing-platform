import { NextRequest, NextResponse } from 'next/server';
import type { PolarWebhookEvent } from '@/lib/polar/polar-client';
import { billingWebhookService } from '@/lib/polar/polar-webhook.service';
import { prisma } from '@/lib/prisma';
import { reconcileMeterUsage } from '@/lib/credit-balance.service';
import {
  validateEvent,
  WebhookVerificationError,
} from '@polar-sh/sdk/webhooks';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.text();

    const headers = {
      'webhook-id': request.headers.get('webhook-id') ?? '',
      'webhook-timestamp': request.headers.get('webhook-timestamp') ?? '',
      'webhook-signature': request.headers.get('webhook-signature') ?? '',
    };

    const webhookSecret = process.env.POLAR_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('POLAR_WEBHOOK_SECRET environment variable not set');
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 500 }
      );
    }

    const event: PolarWebhookEvent = validateEvent(
      payload,
      headers,
      webhookSecret
    ) as PolarWebhookEvent;

    console.log('✅ Webhook signature verified successfully:', event.type);

    await handleWebhookEvent(event);
    console.log(
      '✅ Polar webhook processed:',
      event.type,
      headers['webhook-id']
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
    console.error('Error processing Polar webhook:', err);
    return NextResponse.json(
      { error: 'Internal Server error' },
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
  console.log('🎯 [POLAR WEBHOOK] Processing customer.created:', data);

  try {
  } catch (error) {
    console.error('❌ [POLAR WEBHOOK] Error handling customer.created:', error);
    throw error;
  }
}

async function handleCustomerUpdated(data: any) {
  console.log('Processing customer.updated:', data);

  try {
    const externalId = data.externalId;

    if (externalId) {
      await prisma.user.update({
        where: { id: externalId },
        data: {
          polarCustomerId: data.id,
        },
      });
      console.log(`Customer ${data.id} updated for user ${externalId}`);
    }
  } catch (error) {
    console.error('Error handling customer.updated:', error);
    throw error;
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
    throw error;
  }
}

async function handleCustomerStateChanged(data: any) {
  // Meter notifications are comparison-only. The send transaction accounts for
  // usage; replayed/reset meter snapshots cannot charge or restore credits.
  if (data.externalId && Array.isArray(data.activeMeters)) {
    const consumed = data.activeMeters.reduce(
      (sum: number, meter: { consumedUnits: number }) =>
        sum + meter.consumedUnits,
      0
    );
    const result = await reconcileMeterUsage(data.externalId, consumed);
    console.info('Polar usage reconciliation', {
      userId: data.externalId,
      outcome: result.outcome,
    });
    await invalidateBillingCache(data.externalId);
  }
}

// Order event handlers
async function handleOrderCreated(data: any) {
  const userId = await billingWebhookService.syncOrder(data);
  await invalidateBillingCache(userId);
}

async function handleOrderUpdated(data: any) {
  const userId = await billingWebhookService.syncOrder(data);
  await invalidateBillingCache(userId);
}

async function handleOrderPaid(data: any) {
  const userId = await billingWebhookService.fulfillPaidOrder(data);
  await invalidateBillingCache(userId);
}

async function handleOrderRefunded(data: any) {
  // console.log('Processing order.refunded:', data);

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
    throw error;
  }
}

// Subscription event handlers
async function handleSubscriptionCreated(data: any) {
  const userId = await billingWebhookService.syncSubscription(data);
  await invalidateBillingCache(userId);
}

async function handleSubscriptionUpdated(data: any) {
  const userId = await billingWebhookService.syncSubscription(data);
  await invalidateBillingCache(userId);
}

async function handleSubscriptionCanceled(data: any) {
  console.log('Processing subscription.canceled:', data);

  try {
    const userId = data.customer?.externalId || data.metadata?.userId;

    if (!userId) {
      throw new Error('No local user ID found in subscription metadata');
    }

    // Get current subscription to preserve credit information
    const currentSubscription = await prisma.subscription.findUnique({
      where: { polarSubscriptionId: data.id },
    });

    if (!currentSubscription) {
      throw new Error(`Subscription ${data.id} not found in database`);
    }

    // Update subscription status to canceled BUT preserve remaining credits
    // This allows users to continue using their existing credits until they run out
    await prisma.subscription.update({
      where: { polarSubscriptionId: data.id },
      data: {
        status: 'CANCELED',
        canceledAt: data.canceledAt ? new Date(data.canceledAt) : new Date(),
      },
    });

    console.log(
      `Subscription canceled for user ${userId}. User retains ${currentSubscription.remainingCredits} remaining credits.`
    );
  } catch (error) {
    console.error('Error handling subscription.canceled:', error);
    throw error;
  }
}

async function handleSubscriptionActive(data: any) {
  const userId = await billingWebhookService.syncSubscription(data);
  await invalidateBillingCache(userId);
}

async function handleSubscriptionUncanceled(data: any) {
  const userId = await billingWebhookService.syncSubscription(data);
  await invalidateBillingCache(userId);
}

async function handleSubscriptionRevoked(data: any) {
  const userId = await billingWebhookService.revokeSubscription(data);
  await invalidateBillingCache(userId);
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
    throw error;
  }
}

async function handleRefundUpdated(data: any) {
  console.log('Processing refund.updated:', data);

  try {
    // Handle refund status updates
    console.log(`Refund ${data.id} updated:`, data.status);
  } catch (error) {
    console.error('Error handling refund.updated:', error);
    throw error;
  }
}

async function invalidateBillingCache(userId: string) {
  if (!process.env.REDIS_HOST) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Cache availability must not determine whether a payment is acknowledged.
    await Promise.race([
      import('@/lib/redis').then(({ redis }) =>
        redis.del(
          `billing-status:${userId}`,
          `events-credit-balance:${userId}`,
          `polar:meters:${userId}`
        )
      ),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Billing cache invalidation timed out')),
          1000
        );
      }),
    ]);
  } catch (error) {
    console.warn('Billing cache invalidation failed:', error);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
