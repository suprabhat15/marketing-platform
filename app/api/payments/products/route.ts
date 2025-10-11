import { NextRequest, NextResponse } from 'next/server';
import { getProducts, getProduct } from '@/lib/polar';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');
    const organizationId = searchParams.get('organizationId');

    if (productId) {
      // Get specific product
      const product = await getProduct(productId);
      return NextResponse.json({ product });
    } else {
      // Get all products
      const products = await getProducts(organizationId || undefined);
      return NextResponse.json({ products: products.result || [] });
    }

  } catch (error) {
    console.error('Error fetching products:', error);
    return NextResponse.json(
      { error: 'Failed to fetch products' },
      { status: 500 }
    );
  }
}