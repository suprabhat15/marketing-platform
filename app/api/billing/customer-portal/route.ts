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

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { polarCustomerId: true },
  });

  if (!user?.polarCustomerId) {
    return NextResponse.json(
      { error: 'Customer not found. Please make a purchase first.' },
      { status: 404 }
    );
  }

  try {
    const data = await getCustomerPortalData(user.polarCustomerId, userId);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Error fetching billing portal data:', error);
    return NextResponse.json(
      { error: 'Failed to load billing data', detail: error?.message ?? String(error) },
      { status: 500 }
    );
  }
}