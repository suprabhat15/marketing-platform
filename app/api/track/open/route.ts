import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// 1x1 transparent PNG pixel
const TRACKING_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Handle new encrypted tracking parameter
    const trackingData = searchParams.get('t');
    let campaignId: string | null = null;
    let email: string | null = null;
    let messageId: string | null = null;
    
    if (trackingData) {
      try {
        const decoded = JSON.parse(Buffer.from(trackingData, 'base64').toString());
        campaignId = decoded.campaignId;
        email = decoded.email;
        messageId = decoded.messageId;
      } catch (error) {
        console.error('Failed to decode tracking data:', error);
      }
    }
    
    console.log('📧 Email open tracking request:', { campaignId, email, messageId });

    // Track the open event if we have required parameters
    if (campaignId && email) {
      // Find the subscriber
      const subscriber = await prisma.subscriber.findFirst({
        where: { email },
      });

      if (subscriber) {
        // Check if we already have an open event for this email/campaign/message to avoid duplicates
        const existingEvent = await prisma.event.findFirst({
          where: {
            type: 'OPENED',
            subscriberId: subscriber.id,
            campaignId,
            data: {
              path: ['messageId'],
              equals: messageId || undefined
            }
          }
        });

        if (!existingEvent) {
          // Log the open event
          const newEvent = await prisma.event.create({
            data: {
              type: 'OPENED',
              data: {
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
            console.error('Error broadcasting open event:', error);
          }

          console.log(`✓ Email open tracked for ${email} in campaign ${campaignId}`);
        }
      }
    }

  } catch (error) {
    console.error('Error tracking email open:', error);
    // Continue to return the pixel even if tracking fails
  }

  // Always return the tracking pixel
  return new NextResponse(TRACKING_PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': TRACKING_PIXEL.length.toString(),
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}