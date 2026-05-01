import { polar } from './polar';
import type { SubscriptionUpdate } from '@polar-sh/sdk/models/components/subscriptionupdate.js';

export async function getSubscription(subscriptionId: string) {
  try {
    const response = await polar.subscriptions.get({ id: subscriptionId });
    return response;
  } catch (error) {
    console.error('Error fetching subscription:', error);
    throw new Error('Failed to fetch subscription');
  }
}

// List subscriptions with optional filters
export async function listSubscriptions(params?: {
  organizationId?: string;
  customerId?: string;
  productId?: string;
  active?: boolean;
  limit?: number;
  page?: number;
}) {
  try {
    const response = await polar.subscriptions.list({
      organizationId: params?.organizationId,
      customerId: params?.customerId,
      productId: params?.productId,
      active: params?.active,
      limit: params?.limit || 100,
      page: params?.page || 1,
    });
    return response;
  } catch (error) {
    console.error('Error listing subscriptions:', error);
    throw new Error('Failed to list subscriptions');
  }
}

// Update subscription (modify, pause, resume)
export async function updateSubscription(
  subscriptionId: string,
  updateData: {
    productId?: string;
    priceId?: string;
    metadata?: Record<string, string>;
    prorationBehavior?: 'invoice' | 'prorate' | 'create_prorations' | 'none';
    discountId?: string;
    trialEnd?: string;
    cancelAtPeriodEnd?: boolean;
    customerCancellationReason?: string;
    customerCancellationComment?: string;
    revoke?: boolean;
  }
) {
  try {
    let subscriptionUpdate: SubscriptionUpdate;

    if (updateData.revoke) {
      subscriptionUpdate = {
        revoke: true,
        ...(updateData.customerCancellationReason && {
          customerCancellationReason: updateData.customerCancellationReason as any,
        }),
        ...(updateData.customerCancellationComment && {
          customerCancellationComment: updateData.customerCancellationComment,
        }),
      };
    } else if (updateData.cancelAtPeriodEnd !== undefined) {
      subscriptionUpdate = {
        cancelAtPeriodEnd: updateData.cancelAtPeriodEnd,
        ...(updateData.customerCancellationReason && {
          customerCancellationReason: updateData.customerCancellationReason as any,
        }),
        ...(updateData.customerCancellationComment && {
          customerCancellationComment: updateData.customerCancellationComment,
        }),
      };
    } else if (updateData.productId) {
      subscriptionUpdate = {
        productId: updateData.productId,
        ...(updateData.prorationBehavior && {
          prorationBehavior: updateData.prorationBehavior as any,
        }),
      };
    } else if (updateData.discountId) {
      subscriptionUpdate = {
        discountId: updateData.discountId,
      };
    } else {
      throw new Error('No valid update data provided');
    }
    
    const response = await polar.subscriptions.update({
      id: subscriptionId,
      subscriptionUpdate,
    });
    
    return response;
  } catch (error) {
    console.error('Error updating subscription:', error);
    throw new Error('Failed to update subscription');
  }
}

// Cancel/revoke subscription
export async function cancelSubscription(subscriptionId: string) {
  try {
    const response = await polar.subscriptions.revoke({ id: subscriptionId });
    return response;
  } catch (error) {
    console.error('Error canceling subscription:', error);
    throw new Error('Failed to cancel subscription');
  }
}

// Get user's subscriptions by customer ID
export async function getUserSubscriptions(customerId: string) {
  try {
    const response = await listSubscriptions({
      customerId,
      active: true,
    });
    return response.result || [];
  } catch (error) {
    console.error('Error fetching user subscriptions:', error);
    throw new Error('Failed to fetch user subscriptions');
  }
}

