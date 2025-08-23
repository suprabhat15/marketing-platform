// Store active connections for real-time event broadcasting
const connections = new Map<string, (data: string) => void>();

// Function to register a connection
export function registerConnection(connectionId: string, sendData: (data: string) => void) {
  connections.set(connectionId, sendData);
}

// Function to unregister a connection
export function unregisterConnection(connectionId: string) {
  connections.delete(connectionId);
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