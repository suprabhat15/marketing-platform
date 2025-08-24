// Store active connections for real-time event broadcasting
const connections = new Map<string, (data: string) => void>();

// Store recent events to prevent duplicates (in-memory cache)
const recentEvents = new Map<string, number>();

// Function to register a connection
export function registerConnection(connectionId: string, sendData: (data: string) => void) {
  // Remove any existing connection for the same user/campaign combination
  const connectionParts = connectionId.split('-');
  if (connectionParts.length >= 2) {
    const userCampaignKey = `${connectionParts[0]}-${connectionParts[1]}`;
    const existingConnections = Array.from(connections.keys()).filter(key => 
      key.startsWith(userCampaignKey)
    );
    
    existingConnections.forEach(key => {
      console.log(`Removing existing connection: ${key}`);
      connections.delete(key);
    });
  }
  
  connections.set(connectionId, sendData);
  console.log(`Registered new connection: ${connectionId}`);
}

// Function to unregister a connection
export function unregisterConnection(connectionId: string) {
  connections.delete(connectionId);
}

// Function to broadcast event to all connected clients for a campaign
export async function broadcastEvent(campaignId: string, event: any) {
  // Create a unique key for this event to prevent duplicates
  const eventKey = `${campaignId}-${event.subscriberId}-${event.type}-${event.data?.messageId || event.id}`;
  const now = Date.now();
  
  // Check if we've already broadcast this event recently (within 5 minutes)
  const lastBroadcast = recentEvents.get(eventKey);
  if (lastBroadcast && (now - lastBroadcast) < 5 * 60 * 1000) {
    console.log(`Skipping duplicate event broadcast: ${eventKey}`);
    return;
  }
  
  // Store this event as recently broadcast
  recentEvents.set(eventKey, now);
  
  // Clean up old entries (older than 10 minutes)
  for (const [key, timestamp] of recentEvents.entries()) {
    if (now - timestamp > 10 * 60 * 1000) {
      recentEvents.delete(key);
    }
  }

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

// Function to broadcast campaign status updates
export async function broadcastCampaignUpdate(campaignId: string, status: string, data?: any) {
  const eventData = `data: ${JSON.stringify({ 
    type: 'campaign_status_update', 
    campaignId,
    status,
    data 
  })}\n\n`;

  console.log(`📡 Broadcasting campaign update for ${campaignId}: ${status}`);
  console.log(`📡 Active connections: ${connections.size}`);
  console.log(`📡 Connection IDs:`, Array.from(connections.keys()));

  let broadcastCount = 0;
  // Find all connections for this campaign
  for (const [connectionId, sendData] of connections.entries()) {
    if (connectionId.includes(campaignId)) {
      try {
        console.log(`📡 Sending to connection: ${connectionId}`);
        sendData(eventData);
        broadcastCount++;
      } catch (error) {
        console.error(`Error broadcasting campaign update to connection ${connectionId}:`, error);
        connections.delete(connectionId);
      }
    }
  }

  console.log(`📡 Campaign update broadcasted to ${broadcastCount} connections`);
}

// Cleanup inactive connections periodically
if (typeof window === 'undefined') { // Only run on server
  setInterval(() => {
    const now = Date.now();
    for (const [connectionId] of connections.entries()) {
      const timestamp = parseInt(connectionId.split('-').pop() || '0');
      if (now - timestamp > 3600000) { // 1 hour
        connections.delete(connectionId);
      }
    }
  }, 300000); // Check every 5 minutes
}

export { connections };