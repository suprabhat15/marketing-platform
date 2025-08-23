'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSession } from '@/lib/auth-client';

interface Event {
  id: string;
  type: string;
  data: any | null;
  createdAt: string;
  subscriber?: {
    email: string;
    firstName?: string;
    lastName?: string;
  } | null;
}

interface EventStreamData {
  type: 'connected' | 'initial_events' | 'new_event';
  campaignId?: string;
  events?: Event[];
  event?: Event;
}

interface CampaignStats {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
}

interface RealTimeStatsProps {
  campaignId: string;
}

export function CampaignRealTimeStats({ campaignId }: RealTimeStatsProps) {
  const { data: session } = useSession();
  const [stats, setStats] = useState<CampaignStats>({
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    bounced: 0,
    complained: 0,
  });
  const [recentEvents, setRecentEvents] = useState<Event[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!session?.user?.id || !campaignId) return;

    const eventSource = new EventSource(
      `/api/events/stream?campaignId=${campaignId}&userId=${session.user.id}`
    );

    eventSource.onopen = () => {
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data: EventStreamData = JSON.parse(event.data);
        
        switch (data.type) {
          case 'connected':
            // console.log('Connected to event stream for campaign:', data.campaignId);
            break;
            
          case 'initial_events':
            if (data.events) {
              setRecentEvents(data.events);
              updateStatsFromEvents(data.events);
            }
            break;
            
          case 'new_event':
            if (data.event) {
              setRecentEvents(prev => [data.event!, ...prev.slice(0, 19)]);
              updateStatsFromEvent(data.event);
            }
            break;
        }
      } catch (error) {
        console.error('Error parsing event stream data:', error);
      }
    };

    eventSource.onerror = () => {
      setIsConnected(false);
    };

    return () => {
      eventSource.close();
      setIsConnected(false);
    };
  }, [session?.user?.id, campaignId]);

  const updateStatsFromEvents = (events: Event[]) => {
    const newStats = { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0 };
    
    events.forEach(event => {
      switch (event.type) {
        case 'SENT':
          newStats.sent++;
          break;
        case 'DELIVERED':
          newStats.delivered++;
          break;
        case 'OPENED':
          newStats.opened++;
          break;
        case 'CLICKED':
          newStats.clicked++;
          break;
        case 'BOUNCED':
          newStats.bounced++;
          break;
        case 'COMPLAINED':
          newStats.complained++;
          break;
      }
    });

    setStats(newStats);
  };

  const updateStatsFromEvent = (event: Event) => {
    setStats(prev => {
      const newStats = { ...prev };
      switch (event.type) {
        case 'SENT':
          newStats.sent++;
          break;
        case 'DELIVERED':
          newStats.delivered++;
          break;
        case 'OPENED':
          newStats.opened++;
          break;
        case 'CLICKED':
          newStats.clicked++;
          break;
        case 'BOUNCED':
          newStats.bounced++;
          break;
        case 'COMPLAINED':
          newStats.complained++;
          break;
      }
      return newStats;
    });
  };

  const formatEventTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getEventBadgeVariant = (type: string) => {
    switch (type) {
      case 'SENT':
        return 'default';
      case 'DELIVERED':
        return 'secondary';
      case 'OPENED':
        return 'outline';
      case 'CLICKED':
        return 'default';
      case 'BOUNCED':
        return 'destructive';
      case 'COMPLAINED':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-sm text-muted-foreground">
          {isConnected ? 'Real-time tracking active' : 'Connecting...'}
        </span>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{stats.sent}</div>
              <div className="text-sm text-muted-foreground">Sent</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{stats.delivered}</div>
              <div className="text-sm text-muted-foreground">Delivered</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{stats.opened}</div>
              <div className="text-sm text-muted-foreground">Opened</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{stats.clicked}</div>
              <div className="text-sm text-muted-foreground">Clicked</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{stats.bounced}</div>
              <div className="text-sm text-muted-foreground">Bounced</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{stats.complained}</div>
              <div className="text-sm text-muted-foreground">Complaints</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Events */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-64">
            {recentEvents.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No events yet
              </div>
            ) : (
              <div className="space-y-2">
                {recentEvents.map((event) => (
                  <div key={event.id} className="flex items-center justify-between p-2 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <Badge variant={getEventBadgeVariant(event.type)}>
                        {event.type}
                      </Badge>
                      <div>
                        <div className="font-medium">
                          {event.subscriber?.firstName || event.subscriber?.email || 'Unknown'}
                        </div>
                        {event.type === 'CLICKED' && event.data?.url && (
                          <div className="text-sm text-muted-foreground truncate max-w-xs">
                            {event.data.url}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatEventTime(event.createdAt)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}