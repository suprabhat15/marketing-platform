import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getCustomerPortalData } from '@/lib/polar';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { polarCustomerId: true },
    });

    try {
      const data = await getCustomerPortalData(user?.polarCustomerId ?? null, userId);
      return NextResponse.json({ success: true, data });
    } catch (err: any) {
      // If customer doesn't exist in Polar at all, return 404
      if (
        err?.message === 'CUSTOMER_NOT_FOUND' ||
        err?.statusCode === 404 ||
        err?.statusCode === 422
      ) {
        return NextResponse.json(
          { error: 'Customer not found. Please make a purchase first.' },
          { status: 404 }
        );
      }
      throw err;
    }
  } catch (err: any) {
    console.error('Error fetching billing portal data:', err);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        ...(process.env.NODE_ENV === 'development' && { detail: String(err) }),
      },
      { status: 500 }
    );
  }
}