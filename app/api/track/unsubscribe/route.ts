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
      return NextResponse.json({ error: 'Invalid unsubscribe link' }, { status: 400 });
    }

    const { campaignId, subscriberId, listId } = trackingParams;

    // Update subscriber status to unsubscribed
    await prisma.subscriber.update({
      where: { id: subscriberId },
      data: { status: 'UNSUBSCRIBED' },
    });

    // Record the unsubscribe event
    await prisma.event.create({
      data: {
        type: 'UNSUBSCRIBED',
        subscriberId,
        campaignId,
        data: {
          userAgent: request.headers.get('user-agent'),
          ip: request.ip || request.headers.get('x-forwarded-for'),
          timestamp: new Date().toISOString(),
        },
      },
    });

    // Return a simple unsubscribe confirmation page
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Unsubscribed Successfully</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              max-width: 500px;
              margin: 100px auto;
              padding: 20px;
              text-align: center;
              background-color: #f9fafb;
            }
            .container {
              background: white;
              padding: 40px;
              border-radius: 8px;
              box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            }
            .success-icon {
              width: 60px;
              height: 60px;
              background: #10b981;
              border-radius: 50%;
              margin: 0 auto 20px;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            h1 {
              color: #111827;
              margin-bottom: 16px;
            }
            p {
              color: #6b7280;
              line-height: 1.5;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success-icon">
              <svg width="24" height="24" fill="white" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
              </svg>
            </div>
            <h1>You've been unsubscribed</h1>
            <p>You have been successfully removed from this email list. You will no longer receive emails from this sender.</p>
            <p style="margin-top: 24px; font-size: 14px;">If you unsubscribed by mistake, you can resubscribe by contacting the sender directly.</p>
          </div>
        </body>
      </html>
    `;

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
      },
    });
  } catch (error) {
    console.error('Error processing unsubscribe:', error);
    
    const errorHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Error</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              max-width: 500px;
              margin: 100px auto;
              padding: 20px;
              text-align: center;
              background-color: #f9fafb;
            }
            .container {
              background: white;
              padding: 40px;
              border-radius: 8px;
              box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            }
            h1 { color: #ef4444; }
            p { color: #6b7280; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Something went wrong</h1>
            <p>We encountered an error while processing your unsubscribe request. Please try again or contact support.</p>
          </div>
        </body>
      </html>
    `;

    return new NextResponse(errorHtml, {
      status: 500,
      headers: {
        'Content-Type': 'text/html',
      },
    });
  }
}