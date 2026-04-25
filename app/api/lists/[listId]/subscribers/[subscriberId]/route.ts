import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { updateSubscriberSchema } from "@/lib/validators";
import { ZodError } from 'zod';
import { invalidateUserCache } from '@/lib/redis-cache';

// PATCH /api/lists/[listId]/subscribers/[subscriberId] - Update a subscriber
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string; subscriberId: string }> }
) {
  try {
    // Authentication check
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { listId, subscriberId } = await params;
    const body = await request.json();
    const parsed = updateSubscriberSchema.parse(body);
    const { campaignId, ...updates } = parsed;

    // Verify user owns the list before allowing subscriber modification
    const list = await prisma.list.findFirst({
      where: {
        id: listId,
        userId: session.user.id,
      },
    });

    if (!list) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

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

    // If status flipped ACTIVE → UNSUBSCRIBED in the context of a campaign,
    // emit a synthetic UNSUBSCRIBED event so the Lambda updates Redis and
    // campaign_stats. Status changes without a campaignId are list-management
    // actions, not campaign signals, so they're ignored intentionally.
    //
    // Authorize the campaign before queueing: the caller could otherwise pass
    // an arbitrary campaignId from the body and poison another user's stats.
    // The campaign must belong to the authenticated user AND target this list.
    if (
      campaignId &&
      updates.status === 'UNSUBSCRIBED' &&
      existingSubscriber.status !== 'UNSUBSCRIBED'
    ) {
      const authorizedCampaign = await prisma.campaign.findFirst({
        where: {
          id: campaignId,
          userId: session.user.id,
          listId,
        },
        select: { id: true },
      });

      if (!authorizedCampaign) {
        return NextResponse.json(
          { error: 'Campaign not found or does not belong to this list' },
          { status: 403 }
        );
      }

      try {
        const { sendSesEventToSQS } = await import('@/lib/sqs-service');
        await sendSesEventToSQS({
          eventType: 'Unsubscription',
          campaignId,
          subscriberId,
          uniqueId: `${campaignId}-${subscriberId}-unsub-${Date.now()}`,
        });
      } catch (sqsError) {
        console.error('Error queuing UNSUBSCRIBED event to SQS:', sqsError);
      }
    }

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
    // Authentication check
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { listId, subscriberId } = await params;

    // Verify user owns the list before allowing subscriber deletion
    const list = await prisma.list.findFirst({
      where: {
        id: listId,
        userId: session.user.id,
      },
    });

    if (!list) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    // Check if subscriber exists and belongs to the list
    const existingSubscriber = await prisma.subscriber.findFirst({
      where: {
        id: subscriberId,
        listId,
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

    // Invalidate lists cache so dashboard shows updated count
    await invalidateUserCache(session.user.id, 'lists');

    return NextResponse.json({
      message: 'Subscriber deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting subscriber:', error);
    return NextResponse.json(
      { error: 'Failed to delete subscriber' },
      { status: 500 }
    );
  }
}