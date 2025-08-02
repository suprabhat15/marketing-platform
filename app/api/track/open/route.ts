import { NextRequest, NextResponse } from 'next/server';
import { createEmailTracker } from '@/lib/tracking';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const tracker = createEmailTracker();

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const trackingParams = tracker.extractTrackingParams(searchParams);

    if (!trackingParams) {
      // Return a 1x1 transparent pixel even if tracking fails
      return new NextResponse(
        Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'),
        {
          status: 200,
          headers: {
            'Content-Type': 'image/gif',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
        }
      );
    }

    const { campaignId, subscriberId, listId } = trackingParams;

    // Record the open event
    await prisma.event.create({
      data: {
        type: 'OPENED',
        subscriberId,
        campaignId,
        data: {
          userAgent: request.headers.get('user-agent'),
          ip: request.ip || request.headers.get('x-forwarded-for'),
          timestamp: new Date().toISOString(),
        },
      },
    });

    // Return a 1x1 transparent pixel
    return new NextResponse(
      Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'),
      {
        status: 200,
        headers: {
          'Content-Type': 'image/gif',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (error) {
    console.error('Error tracking email open:', error);
    
    // Still return a pixel even if there's an error
    return new NextResponse(
      Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'),
      {
        status: 200,
        headers: {
          'Content-Type': 'image/gif',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  }
}