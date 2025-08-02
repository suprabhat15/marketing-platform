import { NextRequest, NextResponse } from 'next/server';
import { createEmailTracker } from '@/lib/tracking';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const tracker = createEmailTracker();

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const trackingParams = tracker.extractTrackingParams(searchParams);
    const originalUrl = searchParams.get('u');
    const linkId = searchParams.get('lid');

    if (!trackingParams || !originalUrl) {
      return NextResponse.redirect(originalUrl || 'https://example.com', 302);
    }

    const { campaignId, subscriberId, listId } = trackingParams;
    const decodedUrl = decodeURIComponent(originalUrl);

    // Record the click event
    await prisma.event.create({
      data: {
        type: 'CLICKED',
        subscriberId,
        campaignId,
        data: {
          url: decodedUrl,
          linkId,
          userAgent: request.headers.get('user-agent'),
          ip: request.ip || request.headers.get('x-forwarded-for'),
          timestamp: new Date().toISOString(),
        },
      },
    });

    // Redirect to the original URL
    return NextResponse.redirect(decodedUrl, 302);
  } catch (error) {
    console.error('Error tracking email click:', error);
    
    // Still redirect even if tracking fails
    const originalUrl = request.nextUrl.searchParams.get('u');
    const fallbackUrl = originalUrl ? decodeURIComponent(originalUrl) : 'https://example.com';
    return NextResponse.redirect(fallbackUrl, 302);
  }
}