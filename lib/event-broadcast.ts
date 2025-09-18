// High-performance event broadcasting using SSE manager
import { eventBroadcaster } from './event-broadcaster';

// Store recent events to prevent duplicates (in-memory cache)
const recentEvents = new Map<string, number>();

// Function to broadcast event to all connected clients for a campaign
export async function broadcastEvent(campaignId: string, event: any) {
  // Create a unique key for this event to prevent duplicates
  const eventKey = `${campaignId}-${event.subscriberId}-${event.type}-${event.data?.messageId || event.id}`;
  const now = Date.now();
  
  // Check if we've already broadcast this event recently (within 2 minutes)
  const lastBroadcast = recentEvents.get(eventKey);
  if (lastBroadcast && (now - lastBroadcast) < 2 * 60 * 1000) {
    console.log(`Skipping duplicate event broadcast: ${eventKey}`);
    return;
  }
  
  // Store this event as recently broadcast
  recentEvents.set(eventKey, now);
  
  // Clean up old entries (older than 5 minutes) - more aggressive cleanup
  for (const [key, timestamp] of recentEvents.entries()) {
    if (now - timestamp > 5 * 60 * 1000) {
      recentEvents.delete(key);
    }
  }

  // Use the high-performance event broadcaster
  await eventBroadcaster.queueEvent({
    id: event.id,
    type: event.type,
    campaignId,
    subscriberId: event.subscriberId,
    data: event.data
  });
}

// Function to broadcast campaign status updates
export async function broadcastCampaignUpdate(campaignId: string, status: string) {
  console.log(`📡 Broadcasting campaign update for ${campaignId}: ${status}`);
  
  // Use the high-performance event broadcaster for campaign stats
  const connectionsReached = await eventBroadcaster.broadcastCampaignStats(campaignId);
  
  console.log(`📡 Campaign update broadcasted to ${connectionsReached} connections`);
}

