import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createCustomerSession } from '@/lib/polar';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    // Get user session
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's Polar customer ID
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { polarCustomerId: true },
    });

    if (!user?.polarCustomerId) {
      return NextResponse.json(
        { error: 'Customer not found. Please make a purchase first.' },
        { status: 404 }
      );
    }

    // Create customer session for portal access
    const customerSession = await createCustomerSession(user.polarCustomerId);

    return NextResponse.json({
      success: true,
      customerSession,
    });

  } catch (error) {
    console.error('Error creating customer portal session:', error);
    return NextResponse.json(
      { error: 'Failed to create customer portal session' },
      { status: 500 }
    );
  }
}