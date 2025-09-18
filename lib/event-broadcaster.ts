// High-performance event broadcaster for real-time campaign events
import { sseManager } from './sse-manager';
import { prisma } from './prisma';

interface BroadcastEvent {
  id: string;
  type: 'SENT' | 'DELIVERED' | 'OPENED' | 'CLICKED' | 'BOUNCED' | 'COMPLAINED' | 'UNSUBSCRIBED';
  campaignId: string;
  subscriberId?: string;
  data: any;
}

class EventBroadcaster {
  private eventQueue: BroadcastEvent[] = [];
  private isProcessing = false;
  private readonly BATCH_SIZE = 100;
  private readonly PROCESS_INTERVAL = 500; // 500ms batching

  constructor() {
    // Process events in batches for efficiency
    setInterval(() => this.processBatch(), this.PROCESS_INTERVAL);
  }

  /**
   * Queue an event for broadcasting
   */
  async queueEvent(event: BroadcastEvent) {
    this.eventQueue.push(event);
    
    // If queue is getting large, process immediately
    if (this.eventQueue.length >= this.BATCH_SIZE * 2) {
      this.processBatch();
    }
  }

  /**
   * Broadcast event immediately (for critical events)
   */
  async broadcastImmediately(event: BroadcastEvent) {
    try {
      // Get subscriber details efficiently
      const subscriber = event.subscriberId ? await this.getSubscriberDetails(event.subscriberId) : null;
      
      // Broadcast to SSE connections
      const connectionsReached = sseManager.broadcastToCampaign(event.campaignId, {
        id: event.id,
        type: 'event',
        data: {
          id: event.id,
          type: event.type,
          campaignId: event.campaignId,
          subscriber,
          data: event.data,
          createdAt: new Date().toISOString()
        }
      });

      console.log(`Event ${event.id} broadcasted to ${connectionsReached} connections`);
      return connectionsReached;
    } catch (error) {
      console.error('Error broadcasting event immediately:', error);
      return 0;
    }
  }

  /**
   * Broadcast campaign statistics update
   */
  async broadcastCampaignStats(campaignId: string) {
    try {
      // Get updated campaign stats efficiently
      const stats = await this.getCampaignStats(campaignId);
      
      const connectionsReached = sseManager.broadcastToCampaign(campaignId, {
        id: `stats-${campaignId}-${Date.now()}`,
        type: 'campaign-stats',
        data: stats
      });

      return connectionsReached;
    } catch (error) {
      console.error('Error broadcasting campaign stats:', error);
      return 0;
    }
  }

  /**
   * Process queued events in batches
   */
  private async processBatch() {
    if (this.isProcessing || this.eventQueue.length === 0) return;

    this.isProcessing = true;
    
    try {
      // Take a batch of events
      const batch = this.eventQueue.splice(0, this.BATCH_SIZE);
      
      // Group events by campaign for efficient processing
      const eventsByCampaign = this.groupEventsByCampaign(batch);
      
      // Process each campaign's events
      for (const [campaignId, events] of eventsByCampaign.entries()) {
        await this.processCampaignEvents(campaignId, events);
      }
      
    } catch (error) {
      console.error('Error processing event batch:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Group events by campaign for batch processing
   */
  private groupEventsByCampaign(events: BroadcastEvent[]): Map<string, BroadcastEvent[]> {
    const grouped = new Map<string, BroadcastEvent[]>();
    
    events.forEach(event => {
      const campaignEvents = grouped.get(event.campaignId) || [];
      campaignEvents.push(event);
      grouped.set(event.campaignId, campaignEvents);
    });
    
    return grouped;
  }

  /**
   * Process events for a specific campaign
   */
  private async processCampaignEvents(campaignId: string, events: BroadcastEvent[]) {
    try {
      // Get all unique subscriber IDs in this batch
      const subscriberIds = [...new Set(events.map(e => e.subscriberId).filter(Boolean))];
      
      // Fetch subscriber details in one query
      const subscribers = subscriberIds.length > 0 
        ? await prisma.subscriber.findMany({
            where: { id: { in: subscriberIds as string[] } },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          })
        : [];

      // Create subscriber lookup map
      const subscriberMap = new Map(subscribers.map(s => [s.id, s]));

      // Broadcast each event
      let totalConnections = 0;
      for (const event of events) {
        const subscriber = event.subscriberId ? subscriberMap.get(event.subscriberId) : null;
        
        const connectionsReached = sseManager.broadcastToCampaign(campaignId, {
          id: event.id,
          type: 'event',
          data: {
            id: event.id,
            type: event.type,
            campaignId: event.campaignId,
            subscriber,
            data: event.data,
            createdAt: new Date().toISOString()
          }
        });

        totalConnections += connectionsReached;
      }

      // Broadcast updated campaign stats if there were events
      if (events.length > 0) {
        await this.broadcastCampaignStats(campaignId);
      }

      console.log(`Processed ${events.length} events for campaign ${campaignId}, reached ${totalConnections} connections`);
      
    } catch (error) {
      console.error(`Error processing campaign ${campaignId} events:`, error);
    }
  }

  /**
   * Get subscriber details efficiently
   */
  private async getSubscriberDetails(subscriberId: string) {
    return await prisma.subscriber.findUnique({
      where: { id: subscriberId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true
      }
    });
  }

  /**
   * Get campaign statistics efficiently
   */
  private async getCampaignStats(campaignId: string) {
    const [campaign, eventCounts] = await Promise.all([
      prisma.campaign.findUnique({
        where: { id: campaignId },
        select: {
          id: true,
          name: true,
          status: true,
          sentAt: true,
          createdAt: true
        }
      }),
      prisma.event.groupBy({
        by: ['type'],
        where: { campaignId },
        _count: { type: true }
      })
    ]);

    const eventsByType = eventCounts.reduce((acc, event) => {
      acc[event.type] = event._count.type;
      return acc;
    }, {} as Record<string, number>);

    const totalEvents = eventCounts.reduce((sum, event) => sum + event._count.type, 0);

    return {
      campaign,
      eventsByType,
      totalEvents
    };
  }

  /**
   * Get broadcaster statistics
   */
  getStats() {
    return {
      queueSize: this.eventQueue.length,
      isProcessing: this.isProcessing,
      sseStats: sseManager.getStats()
    };
  }
}

// Singleton instance
export const eventBroadcaster = new EventBroadcaster();

// Helper function to broadcast events easily
export async function broadcastCampaignEvent(event: BroadcastEvent) {
  return await eventBroadcaster.queueEvent(event);
}

export async function broadcastCampaignEventImmediately(event: BroadcastEvent) {
  return await eventBroadcaster.broadcastImmediately(event);
}

export default EventBroadcaster;