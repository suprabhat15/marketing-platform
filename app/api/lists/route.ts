import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { z } from 'zod';

const createListSchema = z.object({
  name: z.string().min(1, 'List name is required'),
  description: z.string().optional(),
  subscribers: z.array(z.object({
    email: z.string().email('Invalid email address'),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    status: z.enum(['ACTIVE', 'UNSUBSCRIBED']).optional(),
  })).optional(),
});

// GET /api/lists - Get all lists for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const lists = await prisma.list.findMany({
      where: { userId: session?.user.id },
      include: {
        _count: {
          select: { subscribers: true },
        },
        subscribers: {
          select: { status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ lists });
  } catch (error) {
    console.error('Error fetching lists:', error);
    return NextResponse.json(
      { error: 'Failed to fetch lists' },
      { status: 500 }
    );
  }
}

// POST /api/lists - Create a new list
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, subscribers } = createListSchema.parse(body);
    
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const list = await prisma.list.create({
      data: {
        name,
        description: description || '',
        userId: session?.user.id,
        subscribers: subscribers ? {
          create: subscribers.map(subscriber => ({
            email: subscriber.email,
            firstName: subscriber.firstName || '',
            lastName: subscriber.lastName || '',
            status: subscriber.status === 'UNSUBSCRIBED' ? 'UNSUBSCRIBED' : 'ACTIVE',
          }))
        } : undefined,
      },
      include: {
        _count: {
          select: { subscribers: true },
        },
      },
    });

    return NextResponse.json({ list }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error creating list:', error);
    return NextResponse.json(
      { error: 'Failed to create list' },
      { status: 500 }
    );
  }
}