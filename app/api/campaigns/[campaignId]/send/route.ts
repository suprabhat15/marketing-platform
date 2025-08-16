import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendCampaign } from '@/lib/email-service';
import { z } from 'zod';

const sendCampaignSchema = z.object({
  scheduleAt: z.string().datetime().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  try {
    const { campaignId } = await params;
    
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        userId: session?.user.id,
      },
      include: {
        list: {
          include: {
            subscribers: {
              where: {
                status: 'ACTIVE',
              },
            },
          },
        },
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (campaign.status === 'SENT') {
      return NextResponse.json(
        { error: 'Campaign already sent' },
        { status: 400 }
      );
    }

    let scheduleAt: string | undefined;
    
    try {
      const body = await request.json();
      const parsed = sendCampaignSchema.parse(body);
      scheduleAt = parsed.scheduleAt;
    } catch (error) {
      // If no body or invalid JSON, proceed without scheduling
      console.log('No valid request body, sending immediately');
    }

    if (scheduleAt) {
      const scheduledDate = new Date(scheduleAt);
      if (scheduledDate <= new Date()) {
        return NextResponse.json(
          { error: 'Schedule date must be in the future' },
          { status: 400 }
        );
      }

      await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: 'SCHEDULED',
          scheduledAt: scheduledDate,
        },
      });

      return NextResponse.json({
        message: 'Campaign scheduled successfully',
        scheduledAt: scheduledDate,
      });
    } else {
      // Send immediately
      const result = await sendCampaign(campaign.id); 

      return NextResponse.json({
        message: 'Campaign sent successfully',
        result // DOUBT: what is this ?
      });
    }
  } catch (error) {
    console.error('Error sending campaign:', error);
    return NextResponse.json(
      { error: 'Failed to send campaign ' + error },
      { status: 500 }
    );
  }
}