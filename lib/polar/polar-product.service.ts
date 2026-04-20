import { polar } from './polar-client';

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
