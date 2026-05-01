import { Polar } from '@polar-sh/sdk';

// Initialize Polar SDK with environment configuration
const accessToken = process.env.POLAR_ACCESS_TOKEN;

if (!accessToken) {
  throw new Error(`POLAR_ACCESS_TOKEN environment variable is required`);
}

export const polar = new Polar({
  accessToken,
});

// Credit package pricing mapping (authoritative source)
export const CREDIT_PRICING = {
  3000: 1.0,
  10000: 10.0,
  20000: 20.0,
  // 50000: 50.00,
  // 100000: 100.00,
  // 500000: 500.00,
} as const;

// Product ID environment variables
export const PRODUCT_ID_3000 = process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID_3K;
export const PRODUCT_ID_10000 = process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID_10K;
export const PRODUCT_ID_20000 = process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID_20K;

if (!PRODUCT_ID_3000 || !PRODUCT_ID_10000 || !PRODUCT_ID_20000) {
  console.warn(
    '⚠️ NEXT_PUBLIC_POLAR_PRODUCT_ID_3K and NEXT_PUBLIC_POLAR_PRODUCT_ID_10K and NEXT_PUBLIC_POLAR_PRODUCT_ID_20K should be set for product credit mapping'
  );
}

// Product ID to credit mapping (matching auth.ts products)
export const PRODUCT_CREDIT_MAPPING: Record<string, number> = {
  ...(PRODUCT_ID_3000 && { [PRODUCT_ID_3000]: 3000 }), // 3k-Credits
  ...(PRODUCT_ID_10000 && { [PRODUCT_ID_10000]: 10000 }), // 10k-Credits
  ...(PRODUCT_ID_20000 && { [PRODUCT_ID_20000]: 20000 }), // 20k-Credits
};

// Helper function to get credits and price from product ID
export function getCreditsPricing(data: { product?: { id?: string } }): {
  credits: number;
  price: number;
} {
  const productId = data.product?.id;
  const credits = productId
    ? PRODUCT_CREDIT_MAPPING[productId]
    : undefined;

  if (!credits) {
    console.error(`Unknown product ID: ${productId}`);
    throw new Error(`No credit mapping found for product: ${productId}`);
  }

  // Get the corresponding price from our pricing table
  const price = CREDIT_PRICING[credits as keyof typeof CREDIT_PRICING];

  if (!price) {
    console.error(`No pricing found for ${credits} credits`);
    throw new Error(`No pricing found for ${credits} credits`);
  }
  return { credits, price };
}

// Process webhook events
export interface PolarWebhookEvent {
  type: string;
  data: any;
}
