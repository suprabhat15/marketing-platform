// High-performance SSE manager for real-time event streaming
import { NextResponse } from 'next/server';

interface SSEConnection {
  campaignId: string;
  controller: ReadableStreamDefaultController;
  lastEventId: string;
  clientId: string;
  timestamp: number;
}

interface CampaignEvent {
  id: string;
  type: string;
  data: any;
  campaignId: string;
  timestamp: number;
}

class SSEManager {
  private connections: Map<string, SSEConnection[]> = new Map();
  private eventBuffer: Map<string, CampaignEvent[]> = new Map();
  private readonly MAX_CONNECTIONS_PER_CAMPAIGN = 100;
  private readonly MAX_BUFFER_SIZE = 1000;
  private readonly CONNECTION_TIMEOUT = 300000; // 5 minutes
  private readonly HEARTBEAT_INTERVAL = 15000; // 15 seconds

  constructor() {
    // Cleanup inactive connections every minute
    setInterval(() => this.cleanupConnections(), 60000);
    
    // Send heartbeat to maintain connections
    // setInterval(() => this.sendHeartbeat(), this.HEARTBEAT_INTERVAL);
  }

  /**
   * Create a new SSE connection for a campaign
   */
  createConnection(campaignId: string, lastEventId?: string): NextResponse {
    const clientId = this.generateClientId();
    const connectionStartTime = Date.now();
    // console.log(`🆕 SSE Manager: Creating connection ${clientId} for campaign ${campaignId}`);
    
    const stream = new ReadableStream({
      start: (controller) => {
        console.log(`🚀 SSE Manager: Starting stream for client ${clientId}, campaign ${campaignId}`);
        
        // Add connection to pool
        this.addConnection(campaignId, controller, clientId, lastEventId);
        
        // Send initial connection confirmation
        this.sendEvent(controller, {
          type: 'connected',
          data: { clientId, campaignId },
          id: `${Date.now()}-connect`
        });

        // Send any buffered events since lastEventId
        this.sendBufferedEvents(campaignId, controller, lastEventId);
        
        // console.log(`✅ SSE Manager: Connection ${clientId} established for campaign ${campaignId}`);
      },
      cancel: (reason) => {
        const duration = Date.now() - connectionStartTime;
        console.log(`❌ SSE Manager: Connection ${clientId} cancelled for campaign ${campaignId}`, {
          reason: reason || 'unknown',
          durationMs: duration,
          durationSec: Math.round(duration / 1000)
        });
        this.removeConnection(campaignId, clientId);
      }
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': `${process.env.NEXT_PUBLIC_APP_URL}`,
        'Access-Control-Allow-Headers': 'Cache-Control'
      }
    });
  }

  /**
   * Broadcast event to all connections for a campaign
   */
  broadcastToCampaign(campaignId: string, event: Omit<CampaignEvent, 'campaignId' | 'timestamp'>) {
    const fullEvent: CampaignEvent = {
      ...event,
      campaignId,
      timestamp: Date.now()
    };

    // Add to buffer for late connections
    this.addToBuffer(campaignId, fullEvent);

    // Get connections for this campaign
    const connections = this.connections.get(campaignId) || [];
    // console.log(`🔗 SSE Manager: Found ${connections.length} connections for campaign ${campaignId}`);
    
    // Broadcast to all active connections
    const activeConnections = connections.filter(conn => {
      try {
        this.sendEvent(conn.controller, {
          type: fullEvent.type,
          data: fullEvent.data,
          id: fullEvent.id
        });
        console.log(`✅ Event sent to connection ${conn.clientId}`);
        return true;
      } catch (error) {
        // Connection is broken, will be cleaned up later
        console.error('Failed to send event to connection:', error);
        return false;
      }
    });

    // Update connections list with only active ones
    if (activeConnections.length !== connections.length) {
      this.connections.set(campaignId, activeConnections);
    }

    // console.log(`📊 SSE Manager: ${activeConnections.length}/${connections.length} connections reached for campaign ${campaignId}`);
    return activeConnections.length;
  }

  /**
   * Broadcast to multiple campaigns efficiently
   */
  broadcastToMultipleCampaigns(campaignIds: string[], event: Omit<CampaignEvent, 'campaignId' | 'timestamp'>) {
    let totalSent = 0;
    campaignIds.forEach(campaignId => {
      totalSent += this.broadcastToCampaign(campaignId, event);
    });
    return totalSent;
  }

  /**
   * Get connection statistics
   */
  getStats() {
    let totalConnections = 0;
    let totalCampaigns = 0;
    
    for (const [campaignId, connections] of this.connections.entries()) {
      if (connections.length > 0) {
        totalCampaigns++;
        totalConnections += connections.length;
      }
    }

    return {
      totalConnections,
      totalCampaigns,
      bufferSizes: Object.fromEntries(
        Array.from(this.eventBuffer.entries()).map(([id, buffer]) => [id, buffer.length])
      )
    };
  }

  private addConnection(campaignId: string, controller: ReadableStreamDefaultController, clientId: string, lastEventId?: string) {
    const connections = this.connections.get(campaignId) || [];
    // console.log(`📊 SSE Manager: Adding connection ${clientId}. Current connections for campaign ${campaignId}: ${connections.length}`);
    
    // Limit connections per campaign to prevent memory issues
    if (connections.length >= this.MAX_CONNECTIONS_PER_CAMPAIGN) {
      const oldest = connections.shift();
      if (oldest) {
        console.log(`🚮 SSE Manager: Removing oldest connection ${oldest.clientId} due to limit`);
        try {
          oldest.controller.close();
        } catch (error) {
          // Connection already closed
        }
      }
    }

    connections.push({
      campaignId,
      controller,
      clientId,
      lastEventId: lastEventId || '0',
      timestamp: Date.now()
    });

    this.connections.set(campaignId, connections);
    // console.log(`✅ SSE Manager: Connection ${clientId} added. Total connections for campaign ${campaignId}: ${connections.length}`);
  }

  private removeConnection(campaignId: string, clientId: string) {
    const connections = this.connections.get(campaignId) || [];
    const filtered = connections.filter(conn => conn.clientId !== clientId);
    
    // console.log(`➖ SSE Manager: Removing connection ${clientId} from campaign ${campaignId}. Before: ${connections.length}, After: ${filtered.length}`);
    
    if (filtered.length === 0) {
      // console.log(`🗑️ SSE Manager: No more connections for campaign ${campaignId}, removing from map`);
      this.connections.delete(campaignId);
    } else {
      this.connections.set(campaignId, filtered);
    }
  }

  private sendEvent(controller: ReadableStreamDefaultController, event: { type: string; data: any; id: string }) {
    const sseData = [
      `id: ${event.id}`,
      `event: ${event.type}`,
      `data: ${JSON.stringify(event.data)}`,
      '',
      ''
    ].join('\n');

    controller.enqueue(new TextEncoder().encode(sseData));
  }

  private addToBuffer(campaignId: string, event: CampaignEvent) {
    const buffer = this.eventBuffer.get(campaignId) || [];
    buffer.push(event);

    // Keep buffer size manageable
    if (buffer.length > this.MAX_BUFFER_SIZE) {
      buffer.splice(0, buffer.length - this.MAX_BUFFER_SIZE);
    }

    this.eventBuffer.set(campaignId, buffer);
  }

  private sendBufferedEvents(campaignId: string, controller: ReadableStreamDefaultController, lastEventId?: string) {
    const buffer = this.eventBuffer.get(campaignId) || [];
    
    if (!lastEventId || lastEventId === '0') {
      // Send recent events if no lastEventId
      const recentEvents = buffer.slice(-10);
      recentEvents.forEach(event => {
        try {
          this.sendEvent(controller, {
            type: event.type,
            data: event.data,
            id: event.id
          });
        } catch (error) {
          // Connection closed
        }
      });
      return;
    }

    // Find events after lastEventId
    const lastIndex = buffer.findIndex(event => event.id === lastEventId);
    if (lastIndex >= 0) {
      const newEvents = buffer.slice(lastIndex + 1);
      newEvents.forEach(event => {
        try {
          this.sendEvent(controller, {
            type: event.type,
            data: event.data,
            id: event.id
          });
        } catch (error) {
          // Connection closed
        }
      });
    }
  }

  private cleanupConnections() {
    const now = Date.now();
    
    for (const [campaignId, connections] of this.connections.entries()) {
      const activeConnections = connections.filter(conn => {
        const isExpired = now - conn.timestamp > this.CONNECTION_TIMEOUT;
        if (isExpired) {
          try {
            conn.controller.close();
          } catch (error) {
            // Already closed
          }
        }
        return !isExpired;
      });

      if (activeConnections.length === 0) {
        this.connections.delete(campaignId);
        // Clean up old buffer entries
        this.eventBuffer.delete(campaignId);
      } else if (activeConnections.length !== connections.length) {
        this.connections.set(campaignId, activeConnections);
      }
    }
  }

  private sendHeartbeat() {
    const heartbeatEvent = {
      type: 'heartbeat',
      data: { timestamp: Date.now() },
      id: `heartbeat-${Date.now()}`
    };

    let totalConnections = 0;
    let successfulHeartbeats = 0;

    for (const [campaignId, connections] of this.connections.entries()) {
      connections.forEach(conn => {
        totalConnections++;
        try {
          this.sendEvent(conn.controller, heartbeatEvent);
          // Update timestamp on successful heartbeat
          conn.timestamp = Date.now();
          successfulHeartbeats++;
        } catch (error) {
          console.error(`❤️‍🩹 Heartbeat failed for connection ${conn.clientId} in campaign ${campaignId}:`, error);
          // Connection will be cleaned up later
        }
      });
    }

    if (totalConnections > 0) {
      console.log(`❤️ Heartbeat sent to ${successfulHeartbeats}/${totalConnections} connections across ${this.connections.size} campaigns`);
    }
  }

  private generateClientId(): string {
    return `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Singleton instance
export const sseManager = new SSEManager();
export default SSEManager;