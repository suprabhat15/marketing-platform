import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { CreditService } from '@/lib/credit-service';
import { z } from 'zod';
import { EventType } from '@prisma/client';

const createEventSchema = z.object({
  type: z.enum(['SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'COMPLAINED', 'UNSUBSCRIBED']),
  campaignId: z.string().optional(),
  subscriberId: z.string().optional(),
  data: z.record(z.any()).optional(),
});

// Create email event and handle credit deduction
export async function POST(request: NextRequest) {
  try {
    // Get user session
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validatedData = createEventSchema.parse(body);

    // Create event in database
    const event = await prisma.event.create({
      data: {
        type: validatedData.type as EventType,
        data: validatedData.data || {},
        ...(validatedData.campaignId && { campaignId: validatedData.campaignId }),
        ...(validatedData.subscriberId && { subscriberId: validatedData.subscriberId }),
      },
    });

    // Process credit deduction for SENT and BOUNCED events
    if (validatedData.type === 'SENT' || validatedData.type === 'BOUNCED') {
      try {
        await CreditService.processEmailEvent(
          session.user.id,
          validatedData.type as EventType,
          {
            campaignId: validatedData.campaignId,
            subscriberId: validatedData.subscriberId,
            metadata: validatedData.data,
          }
        );
      } catch (creditError) {
        console.error('Error processing credit deduction:', creditError);
        // Don't fail the event creation if credit deduction fails
      }
    }

    return NextResponse.json({
      success: true,
      event,
      message: 'Event created successfully',
    });

  } catch (error) {
    console.error('Error creating event:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create event' },
      { status: 500 }
    );
  }
}

// Get user's credit balance
export async function GET(request: NextRequest) {
  try {
    // Get user session
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const creditBalance = await CreditService.getUserCreditBalance(session.user.id);

    return NextResponse.json({
      success: true,
      creditBalance,
    });

  } catch (error) {
    console.error('Error fetching credit balance:', error);
    return NextResponse.json(
      { error: 'Failed to fetch credit balance' },
      { status: 500 }
    );
  }
}