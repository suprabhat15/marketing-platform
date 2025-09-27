import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { addSubscriberSchema } from "@/lib/validators";
import { ZodError } from 'zod';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { listId } = await params;
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const list = await prisma.list.findFirst({
      where: {
        id: listId,
        userId: session?.user.id,
      },
    });

    if (!list) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    const subscribers = await prisma.subscriber.findMany({
      where: { listId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ subscribers });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { listId } = await params;
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const list = await prisma.list.findFirst({
      where: {
        id: listId,
        userId: session?.user.id,
      },
    });

    if (!list) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    const body = await request.json();
    const { email, firstName, lastName } = addSubscriberSchema.parse(body);

    const subscriber = await prisma.subscriber.upsert({
      where: {
        email_listId: {
          email,
          listId,
        },
      },
      update: {
        firstName,
        lastName,
        status: 'ACTIVE',
      },
      create: {
        email,
        firstName,
        lastName,
        listId,
      },
    });

    return NextResponse.json({ subscriber }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}