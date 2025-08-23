import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

// Store active connections
const connections = new Map<string, (data: string) => void>();

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
      // Send initial connection confirmation
      const data = `data: ${JSON.stringify({ type: 'connected', campaignId })}\n\n`;
      controller.enqueue(new TextEncoder().encode(data));

      // Store the connection
      connections.set(connectionId, (data: string) => {
        try {
          controller.enqueue(new TextEncoder().encode(data));
        } catch (error) {
          console.error('Error sending SSE data:', error);
          connections.delete(connectionId);
        }
      });

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
        const initialData = `data: ${JSON.stringify({ 
          type: 'initial_events', 
          events 
        })}\n\n`;
        try {
          controller.enqueue(new TextEncoder().encode(initialData));
        } catch (error) {
          console.error('Error sending initial events:', error);
        }
      }).catch(error => {
        console.error('Error fetching initial events:', error);
      });
    },

    cancel() {
      connections.delete(connectionId);
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

// Function to broadcast event to all connected clients for a campaign
export async function broadcastEvent(campaignId: string, event: any) {
  const eventData = `data: ${JSON.stringify({ 
    type: 'new_event', 
    event,
    campaignId 
  })}\n\n`;

  // Find all connections for this campaign
  for (const [connectionId, sendData] of connections.entries()) {
    if (connectionId.includes(campaignId)) {
      try {
        sendData(eventData);
      } catch (error) {
        console.error(`Error broadcasting to connection ${connectionId}:`, error);
        connections.delete(connectionId);
      }
    }
  }
}

// Cleanup inactive connections periodically
setInterval(() => {
  const now = Date.now();
  for (const [connectionId] of connections.entries()) {
    const timestamp = parseInt(connectionId.split('-').pop() || '0');
    if (now - timestamp > 3600000) { // 1 hour
      connections.delete(connectionId);
    }
  }
}, 300000); // Check every 5 minutes