import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { updateListSchema, updateListBasicSchema } from '@/lib/validators';
import { ZodError } from 'zod';
import { invalidateUserCache } from '@/lib/redis-cache';

// GET /api/lists/[listId] - Get specific list details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    // Authentication check
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { listId } = await params;

    // Verify user owns the list
    const list = await prisma.list.findFirst({
      where: {
        id: listId,
        userId: session.user.id,
      },
      include: {
        _count: {
          select: { subscribers: true },
        },
      },
    });

    if (!list) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    return NextResponse.json(list);
  } catch (error) {
    console.error('Error fetching list:', error);
    return NextResponse.json(
      { error: 'Failed to fetch list' },
      { status: 500 }
    );
  }
}

// PUT /api/lists/[listId] - Update list
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    // Authentication check
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { listId } = await params;
    const body = await request.json();

    // Check if this is a basic update (name/description only) or full update with subscribers
    const isBasicUpdate = !body.hasOwnProperty('subscribers');

    if (isBasicUpdate) {
      // Handle basic list updates (name/description only)
      const { name, description } = updateListBasicSchema.parse(body);

      // Verify user owns the list before updating
      const existingList = await prisma.list.findFirst({
        where: {
          id: listId,
          userId: session.user.id,
        },
      });

      if (!existingList) {
        return NextResponse.json({ error: 'List not found' }, { status: 404 });
      }

      const updatedList = await prisma.list.update({
        where: { id: listId },
        data: {
          name,
          description: description || '',
          updatedAt: new Date(),
        },
        include: {
          _count: {
            select: { subscribers: true },
          },
        },
      });

      await invalidateUserCache(session.user.id, 'lists');

      return NextResponse.json(updatedList);
    } else {
      // Handle full update with subscribers (existing logic)
      const { name, description, subscribers } = updateListSchema.parse(body);

      // Verify user owns the list before updating
      const existingList = await prisma.list.findFirst({
        where: {
          id: listId,
          userId: session.user.id,
        },
        include: { subscribers: true },
      });

      if (!existingList) {
        return NextResponse.json({ error: 'List not found' }, { status: 404 });
      }

      // Update list in transaction
      const updatedList = await prisma.$transaction(async (tx) => {
        // Update list basic info
        const list = await tx.list.update({
          where: { id: listId },
          data: {
            name,
            description: description || '',
            updatedAt: new Date(),
          },
        });

        if (subscribers) {
          // Handle subscribers updates
          const existingSubscriberIds = existingList.subscribers.map(
            (s) => s.id
          );
          const updatedSubscriberIds = subscribers
            .filter((s) => s.id)
            .map((s) => s.id!);

          // Delete removed subscribers
          const subscribersToDelete = existingSubscriberIds.filter(
            (id) => !updatedSubscriberIds.includes(id)
          );

          if (subscribersToDelete.length > 0) {
            await tx.subscriber.deleteMany({
              where: { id: { in: subscribersToDelete } },
            });
          }

          // Update or create subscribers
          for (const subscriber of subscribers) {
            if (subscriber.id) {
              // Update existing subscriber
              await tx.subscriber.update({
                where: { id: subscriber.id },
                data: {
                  email: subscriber.email,
                  firstName: subscriber.firstName || '',
                  lastName: subscriber.lastName || '',
                  status: subscriber.status,
                },
              });
            } else {
              // Create new subscriber
              await tx.subscriber.create({
                data: {
                  email: subscriber.email,
                  firstName: subscriber.firstName || '',
                  lastName: subscriber.lastName || '',
                  status: subscriber.status,
                  listId,
                },
              });
            }
          }
        }

        return list;
      });

      await invalidateUserCache(session.user.id, 'lists');

      return NextResponse.json(updatedList);
    }
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error updating list:', error);
    return NextResponse.json(
      { error: 'Failed to update list' },
      { status: 500 }
    );
  }
}

// DELETE /api/lists/[listId] - Delete list
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { listId } = await params;

    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user owns the list before deletion
    const existingList = await prisma.list.findFirst({
      where: {
        id: listId,
        userId: session.user.id,
      },
    });

    if (!existingList) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    // Check if there are campaigns using this list
    const campaignsUsingList = await prisma.campaign.findMany({
      where: { listId },
      select: { id: true, name: true, status: true },
    });

    if (campaignsUsingList.length > 0) {
      const campaignNames = campaignsUsingList.map((c) => c.name).join(', ');
      return NextResponse.json(
        {
          error: `Cannot delete list. It is being used by ${campaignsUsingList.length} campaign(s): ${campaignNames}. Please delete or update these campaigns first.`,
        },
        { status: 400 }
      );
    }

    // Delete list (subscribers will be deleted due to cascade)
    await prisma.list.delete({
      where: { id: listId },
    });

    // Invalidate lists cache
    await invalidateUserCache(session.user.id, 'lists');

    return NextResponse.json({ message: 'List deleted successfully' });
  } catch (error) {
    console.error('Error deleting list:', error);
    return NextResponse.json(
      { error: 'Failed to delete list' },
      { status: 500 }
    );
  }
}
