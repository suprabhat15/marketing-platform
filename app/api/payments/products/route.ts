import { NextRequest, NextResponse } from 'next/server';
import { getProducts, getProduct, initializeAllProductMeters } from '@/lib/polar';
import { auth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const productId = new URL(request.url).searchParams.get('productId');

    if (productId) {
      const product = await getProduct(productId);
      return NextResponse.json({ product });
    } else {
      const products = await getProducts();
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