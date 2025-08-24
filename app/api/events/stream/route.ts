import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { registerConnection, unregisterConnection } from '@/lib/event-broadcast';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get('campaignId');
  const userId = searchParams.get('userId');

  if (!campaignId || !userId) {
    return new Response('Missing parameters', { status: 400 });
  }

  // Verify user has access to this campaign
  const campaign = await prisma.campaign.findFirst({
    where: {
      id: campaignId,
      userId: userId,
    },
  });

  if (!campaign) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Create a unique connection ID
  const connectionId = `${userId}-${campaignId}-${Date.now()}`;

  // Set up SSE stream
  const stream = new ReadableStream({
    start(controller) {
      let isClosed = false;
      
      // Send initial connection confirmation
      const data = `data: ${JSON.stringify({ type: 'connected', campaignId })}\n\n`;
      controller.enqueue(new TextEncoder().encode(data));

      // Store the connection
      const sendData = (data: string) => {
        if (isClosed) return;
        
        try {
          controller.enqueue(new TextEncoder().encode(data));
        } catch (error) {
          console.error('Error sending SSE data:', error);
          isClosed = true;
          unregisterConnection(connectionId);
        }
      };
      registerConnection(connectionId, sendData);

      // Send recent events for this campaign
      prisma.event.findMany({
        where: { campaignId },
        include: {
          subscriber: {
            select: {
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }).then(events => {
        if (isClosed) return; // Don't send if connection is closed
        
        const initialData = `data: ${JSON.stringify({ 
          type: 'initial_events', 
          events 
        })}\n\n`;
        try {
          controller.enqueue(new TextEncoder().encode(initialData));
        } catch (error) {
          console.error('Error sending initial events:', error);
          isClosed = true;
        }
      }).catch(error => {
        console.error('Error fetching initial events:', error);
      });
      
      // Mark as closed when cancel is called
      return () => {
        isClosed = true;
      };
    },

    cancel() {
      unregisterConnection(connectionId);
      console.log(`SSE connection closed: ${connectionId}`);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    },
  });
}