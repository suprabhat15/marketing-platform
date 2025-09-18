// Global SSE manager to prevent duplicate connections
'use client';

interface SSEConnection {
  campaignId: string;
  userId: string;
  eventSource: EventSource;
  subscribers: Set<(data: any) => void>;
}

class GlobalSSEManager {
  private connections: Map<string, SSEConnection> = new Map();

  private getConnectionKey(campaignId: string, userId: string): string {
    return `${campaignId}-${userId}`;
  }

  subscribe(
    campaignId: string, 
    userId: string, 
    callback: (data: any) => void
  ): () => void {
    const key = this.getConnectionKey(campaignId, userId);
    let connection = this.connections.get(key);

    if (!connection) {
      // Create new SSE connection
      console.log(`🆕 Creating new SSE connection for campaign: ${campaignId}`);
      
      const eventSource = new EventSource(
        `/api/events/stream?campaignId=${campaignId}&userId=${userId}`
      );

      connection = {
        campaignId,
        userId,
        eventSource,
        subscribers: new Set()
      };

      // Set up event handlers
      eventSource.onopen = () => {
        console.log(`📡 Global SSE opened for campaign: ${campaignId}`);
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log(`📨 Global SSE event for campaign ${campaignId}:`, data);
          
          // Notify all subscribers
          connection!.subscribers.forEach(callback => callback(data));
        } catch (error) {
          console.error('❌ Error parsing global SSE event:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error(`❌ Global SSE error for campaign ${campaignId}:`, error);
        this.cleanup(key);
      };

      this.connections.set(key, connection);
    }

    // Add subscriber
    connection.subscribers.add(callback);
    console.log(`➕ Added subscriber for campaign ${campaignId} (${connection.subscribers.size} total)`);

    // Return unsubscribe function
    return () => {
      const conn = this.connections.get(key);
      if (conn) {
        conn.subscribers.delete(callback);
        console.log(`➖ Removed subscriber for campaign ${campaignId} (${conn.subscribers.size} remaining)`);
        
        // If no more subscribers, close connection
        if (conn.subscribers.size === 0) {
          console.log(`🔌 Closing SSE for campaign ${campaignId} (no more subscribers)`);
          this.cleanup(key);
        }
      }
    };
  }

  private cleanup(key: string) {
    const connection = this.connections.get(key);
    if (connection) {
      connection.eventSource.close();
      this.connections.delete(key);
    }
  }

  getStats() {
    return {
      activeConnections: this.connections.size,
      connections: Array.from(this.connections.values()).map(conn => ({
        campaignId: conn.campaignId,
        subscriberCount: conn.subscribers.size
      }))
    };
  }
}

// Singleton instance
export const globalSSEManager = new GlobalSSEManager();