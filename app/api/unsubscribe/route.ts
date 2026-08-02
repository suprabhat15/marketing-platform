import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyUnsubscribeToken } from '@/lib/unsubscribe-token';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const sid = searchParams.get('sid');
  const cid = searchParams.get('cid');
  const token = searchParams.get('token');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const errorUrl = new URL('/unsubscribe?status=error', appUrl);

  if (!sid || !cid || !token || !verifyUnsubscribeToken(sid, cid, token)) {
    return NextResponse.redirect(errorUrl);
  }

  const subscriber = await prisma.subscriber.findUnique({
    where: { id: sid },
    select: { id: true, email: true, listId: true, status: true },
  });

  if (!subscriber) {
    return NextResponse.redirect(errorUrl);
  }

  // Campaign may have been deleted after delivery — that must not block a legal opt-out.
  // Token + subscriber existence is sufficient proof of authenticity.
  await prisma.campaign.findFirst({
    where: { id: cid, listId: subscriber.listId },
    select: { id: true },
  });

  // Atomic flip — prevents duplicate events on concurrent double-clicks
  const result = await prisma.subscriber.updateMany({
    where: { id: sid, status: { not: 'UNSUBSCRIBED' } },
    data: { status: 'UNSUBSCRIBED' },
  });

  if (result.count === 0) {
    return NextResponse.redirect(new URL('/unsubscribe?status=already', appUrl));
  }

  try {
    const unsubEvent = await prisma.event.create({
      data: {
        type: 'UNSUBSCRIBED',
        data: {
          email: subscriber.email,
          source: 'unsubscribe_link',
          timestamp: new Date().toISOString(),
        },
        subscriberId: sid,
        campaignId: cid,
      },
    });

    if (cid) {
      const { publishCampaignEvent } = await import('@/lib/sse-pubsub');
      await publishCampaignEvent(cid, {
        type: 'event_recorded',
        data: { campaignId: cid, eventType: 'UNSUBSCRIBED' },
        id: unsubEvent.id,
      });
    }
  } catch (err) {
    console.error('Failed to create UNSUBSCRIBED event', { error: err, email: subscriber.email, sid, cid });
  }

  try {
    const { sendSesEventToSQS } = await import('@/lib/sqs-service');
    await sendSesEventToSQS({
      eventType: 'Unsubscription',
      campaignId: cid,
      subscriberId: sid,
      uniqueId: `${cid}-${sid}-unsub-${Date.now()}`,
    });
  } catch (err) {
    console.error('Failed to queue unsubscribe SQS event:', err);
  }

  return NextResponse.redirect(new URL('/unsubscribe?confirmed=1', appUrl));
}
