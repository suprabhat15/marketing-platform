import { polar } from './polar-client';
import { getOrCreateMeterForProduct } from './polar-meter.service';

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

// Create checkout session with automatic meter initialization
export async function createCheckoutSession(data: CheckoutSessionData) {
  try {
    const productId = data?.productId;
    if (!productId) {
      throw new Error('productId is required for checkout session');
    }
    const checkoutData: any = {
      products: [productId],
      customer_email: data.customerEmail,
    };

    // Automatically ensure meter exists for the product before creating checkout
    try {
      const meterOrBenefit = await getOrCreateMeterForProduct(productId);
      // console.log('METER INFOssss ', meterOrBenefit);

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
