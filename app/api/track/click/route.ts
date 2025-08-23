import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get('cid');
    const originalUrl = searchParams.get('url');
    const email = searchParams.get('email');
    const messageId = searchParams.get('mid');

    console.log('🔗 Email click tracking request:', { campaignId, email, originalUrl, messageId });

    // Validate required parameters
    if (!campaignId || !originalUrl || !email) {
      console.log('❌ Missing required parameters for click tracking');
      return NextResponse.redirect(originalUrl || `${process.env.NEXT_PUBLIC_APP_URL}`);
    }

    // Find the subscriber
    const subscriber = await prisma.subscriber.findFirst({
      where: { email },
    });

    if (subscriber) {
      // Log the click event
      const newEvent = await prisma.event.create({
        data: {
          type: 'CLICKED',
          data: {
            url: originalUrl,
            email,
            messageId,
            timestamp: new Date().toISOString(),
            userAgent: request.headers.get('user-agent'),
            ipAddress: request.headers.get('x-forwarded-for') || 
                      request.headers.get('x-real-ip') || 
                      'unknown',
          },
          subscriberId: subscriber.id,
          campaignId,
        },
        include: {
          subscriber: {
            select: {
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      // Broadcast the event to real-time listeners
      try {
        const { broadcastEvent } = await import('@/app/api/events/stream/route');
        await broadcastEvent(campaignId, newEvent);
      } catch (error) {
        console.error('Error broadcasting click event:', error);
      }

      console.log(`✓ Click tracked for ${email} in campaign ${campaignId}: ${originalUrl}`);
    }

    // Redirect to the original URL
    return NextResponse.redirect(originalUrl);

  } catch (error) {
    console.error('Error tracking click:', error);
    
    // Even if tracking fails, redirect to the original URL
    const { searchParams } = new URL(request.url);
    const originalUrl = searchParams.get('url');
    return NextResponse.redirect(originalUrl || `${process.env.NEXT_PUBLIC_APP_URL}`);
  }
}