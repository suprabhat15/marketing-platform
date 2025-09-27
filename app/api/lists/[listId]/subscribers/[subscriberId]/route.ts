import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { updateSubscriberSchema } from "@/lib/validators";
import { ZodError } from 'zod';

// PATCH /api/lists/[listId]/subscribers/[subscriberId] - Update a subscriber
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string; subscriberId: string }> }
) {
  try {
    const { listId, subscriberId } = await params;
    const body = await request.json();
    const updates = updateSubscriberSchema.parse(body);

    // Check if subscriber exists and belongs to the list
    const existingSubscriber = await prisma.subscriber.findFirst({
      where: { 
        id: subscriberId,
        listId 
      },
    });

    if (!existingSubscriber) {
      return NextResponse.json(
        { error: 'Subscriber not found' },
        { status: 404 }
      );
    }

    // Update the subscriber
    const updatedSubscriber = await prisma.subscriber.update({
      where: { id: subscriberId },
      data: updates,
    });

    return NextResponse.json({ 
      subscriber: updatedSubscriber,
      message: 'Subscriber updated successfully'
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error updating subscriber:', error);
    return NextResponse.json(
      { error: 'Failed to update subscriber' },
      { status: 500 }
    );
  }
}

// DELETE /api/lists/[listId]/subscribers/[subscriberId] - Delete a subscriber
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string; subscriberId: string }> }
) {
  try {
    const { listId, subscriberId } = await params;

    // Check if subscriber exists and belongs to the list
    const existingSubscriber = await prisma.subscriber.findFirst({
      where: { 
        id: subscriberId,
        listId 
      },
    });

    if (!existingSubscriber) {
      return NextResponse.json(
        { error: 'Subscriber not found' },
        { status: 404 }
      );
    }

    // Delete the subscriber
    await prisma.subscriber.delete({
      where: { id: subscriberId },
    });

    return NextResponse.json({ 
      message: 'Subscriber deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting subscriber:', error);
    return NextResponse.json(
      { error: 'Failed to delete subscriber' },
      { status: 500 }
    );
  }
}