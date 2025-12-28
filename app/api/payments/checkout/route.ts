import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createCheckoutSession, createOrGetCustomer } from '@/lib/polar';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const createCheckoutSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  successUrl: z.string().url('Invalid success URL').optional(),
  cancelUrl: z.string().url('Invalid cancel URL').optional(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Get user session
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = createCheckoutSchema.parse(body);
    console.log("----------validatedData ---------- ", validatedData);
    
    // Create or get Polar customer
    const customer = await createOrGetCustomer({
      email: session.user.email,
      name: session.user.name,
      // metadata: {
      userId: session.user.id,
      // },
    });


    // Update user with Polar customer ID
    await prisma.user.update({
      where: { id: session.user.id },
      data: { polarCustomerId: customer.id },
    });

    // Create checkout session with customer
    const checkoutSession = await createCheckoutSession({
      productId: validatedData.productId,
      successUrl: validatedData.successUrl,
      cancelUrl: validatedData.cancelUrl,
      customerId: customer.id,
      metadata: {
        userId: session.user.id,
        userEmail: session.user.email,
        ...(validatedData.metadata || {}),
      },
    });

    return NextResponse.json({
      success: true,
      checkoutUrl: checkoutSession.url,
      sessionId: checkoutSession.id,
    });

  } catch (error) {
    console.error('Error creating checkout session:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}

// Get user's payment history
export async function GET(request: NextRequest) {
  try {
    // Get user session
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // TODO: Implement fetching user's orders/subscriptions from Polar
    // This would require storing user's Polar customer ID in your database
    
    return NextResponse.json({
      orders: [],
      subscriptions: [],
    });

  } catch (error) {
    console.error('Error fetching payment history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payment history' },
      { status: 500 }
    );
  }
}