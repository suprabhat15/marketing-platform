import { polar } from './polar';

// Get a specific subscription
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
    // Map our updateData to Polar API format
    const subscriptionUpdate: any = {};
    
    if (updateData.productId) {
      subscriptionUpdate.product_id = updateData.productId;
    }
    
    if (updateData.prorationBehavior) {
      subscriptionUpdate.proration_behavior = updateData.prorationBehavior;
    }
    
    if (updateData.discountId) {
      subscriptionUpdate.discount_id = updateData.discountId;
    }
    
    if (updateData.trialEnd) {
      subscriptionUpdate.trial_end = updateData.trialEnd;
    }
    
    if (updateData.cancelAtPeriodEnd !== undefined) {
      subscriptionUpdate.cancel_at_period_end = updateData.cancelAtPeriodEnd;
    }
    
    if (updateData.customerCancellationReason) {
      subscriptionUpdate.customer_cancellation_reason = updateData.customerCancellationReason;
    }
    
    if (updateData.customerCancellationComment) {
      subscriptionUpdate.customer_cancellation_comment = updateData.customerCancellationComment;
    }
    
    if (updateData.revoke !== undefined) {
      subscriptionUpdate.revoke = updateData.revoke;
    }
    
    // Only proceed if we have data to update
    if (Object.keys(subscriptionUpdate).length === 0) {
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

// Get subscription usage and limits
export async function getSubscriptionUsage(subscriptionId: string) {
  try {
    // This would depend on your specific usage tracking implementation
    // For now, return a placeholder structure
    return {
      subscriptionId,
      emailsSent: 0,
      emailsLimit: 0,
      subscribersCount: 0,
      subscribersLimit: 0,
      period: {
        start: new Date().toISOString(),
        end: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error('Error fetching subscription usage:', error);
    throw new Error('Failed to fetch subscription usage');
  }
}