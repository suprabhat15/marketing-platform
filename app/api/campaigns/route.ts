import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const createCampaignSchema = z.object({
  name: z.string().min(1).max(100),
  subject: z.string().min(1).max(200),
  content: z.string().min(1),
  listId: z.string(),
  templateId: z.string().optional(),
  scheduledAt: z.string().datetime().optional(),
  // subscriberIds: z.array(z.string()).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    // if (!session) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }

    const campaigns = await prisma.campaign.findMany({
      where: { userId: session?.user.id || 'cmdowqcn000003v0xla2ytqwz' },
      include: {
        list: true,
        template: true,
        _count: {
          select: {
            events: {
              where: { type: 'SENT' },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate stats
    const stats = {
      total: campaigns.length,
      sent: campaigns.filter(c => c.status === 'SENT').length,
      scheduled: campaigns.filter(c => c.status === 'SCHEDULED').length,
      draft: campaigns.filter(c => c.status === 'DRAFT').length,
    };

    return NextResponse.json({ campaigns, stats });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error ' },
      { status: 500 }
    );
  }
}
// Create a campaign
export async function POST(request: NextRequest) { // Created first campaign via seed.ts
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    // if (!session) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }

    const body = await request.json();
    const { name, subject, content, listId, templateId, scheduledAt } =
      createCampaignSchema.parse(body);

    // Verify list ownership
    const list = await prisma.list.findFirst({
      where: {
        id: listId,
        userId: session?.user.id || 'cmdowqcn000003v0xla2ytqwz',
      },
    });

    if (!list) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    const campaign = await prisma.campaign.create({
      data: {
        name,
        subject,
        content,
        listId,
        templateId,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
        userId: session?.user.id || 'cmdowqcn000003v0xla2ytqwz',
      },
    });

    // If specific subscribers are selected, store this information
    // For now, we'll use the existing list relationship
    // In a production app, you might want a separate table for campaign recipients

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}