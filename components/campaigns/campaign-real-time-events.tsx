'use client';

import { useEffect, useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Activity, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { useSession } from '@/lib/auth-client';

interface Event {
  id: string;
  type: string;
  data?: any;
  createdAt: string;
  subscriber?: {
    id?: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
}


interface CampaignStats {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  unsubscribed: number;
}

interface CampaignRealTimeEventsProps {
  campaignId: string;
  initialEvents: Event[];
  onStatsUpdate?: (stats: CampaignStats) => void;
}

export function CampaignRealTimeEvents({ 
  campaignId, 
  initialEvents, 
  onStatsUpdate 
}: CampaignRealTimeEventsProps) {
  const { data: session } = useSession();
  const [events, setEvents] = useState<Event[]>(initialEvents);
  const [isConnected, setIsConnected] = useState(false);
  const [eventFilter, setEventFilter] = useState<string>('all');
  const [stats, setStats] = useState<CampaignStats>({
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    bounced: 0,
    complained: 0,
    unsubscribed: 0,
  });

  const calculateStats = useCallback((eventList: Event[]) => {
    const newStats = {
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      complained: 0,
      unsubscribed: 0,
    };
    
    eventList.forEach(event => {
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
        case 'UNSUBSCRIBED':
          newStats.unsubscribed++;
          break;
      }
    });

    setStats(newStats);
    onStatsUpdate?.(newStats);
  }, [onStatsUpdate]);

  useEffect(() => {
    calculateStats(initialEvents);
  }, [initialEvents, calculateStats]);

  useEffect(() => {
    if (!session?.user?.id || !campaignId) return;

    // Fetch events from database every 5 seconds
    const fetchEvents = async () => {
      try {
        const response = await fetch(`/api/campaigns/${campaignId}/events`);
        if (response.ok) {
          const data = await response.json();
          setEvents(data.events || []);
          calculateStats(data.events || []);
          setIsConnected(true);
        } else {
          setIsConnected(false);
        }
      } catch (error) {
        console.error('Error fetching events:', error);
        setIsConnected(false);
      }
    };

    // Initial fetch
    fetchEvents();

    // Poll every 5 seconds
    const interval = setInterval(fetchEvents, 5000);

    return () => {
      clearInterval(interval);
      setIsConnected(false);
    };
  }, [session?.user?.id, campaignId, calculateStats]);

  const getFilteredEvents = () => {
    if (eventFilter === 'all') return events;
    return events.filter(event => event.type === eventFilter);
  };

  const getEventTypeColor = (type: string) => {
    switch (type) {
      case 'SENT':
        return 'bg-blue-100 text-blue-800';
      case 'DELIVERED':
        return 'bg-green-100 text-green-800';
      case 'OPENED':
        return 'bg-purple-100 text-purple-800';
      case 'CLICKED':
        return 'bg-orange-100 text-orange-800';
      case 'BOUNCED':
        return 'bg-red-100 text-red-800';
      case 'COMPLAINED':
        return 'bg-red-100 text-red-800';
      case 'UNSUBSCRIBED':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredEvents = getFilteredEvents();

  return (
    <div className="space-y-4">
      {/* Real-time Connection Status & Stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
            <span className="text-xs text-muted-foreground">
              {isConnected ? 'Live tracking' : 'Offline'}
            </span>
          </div>
          
          {/* Quick Stats */}
          <div className="flex gap-2">
            {stats.sent > 0 && (
              <Badge variant="outline" className="text-xs">
                Sent: {stats.sent}
              </Badge>
            )}
            {stats.delivered > 0 && (
              <Badge variant="outline" className="text-xs bg-green-50">
                Delivered: {stats.delivered}
              </Badge>
            )}
            {stats.opened > 0 && (
              <Badge variant="outline" className="text-xs bg-purple-50">
                Opened: {stats.opened}
              </Badge>
            )}
            {stats.clicked > 0 && (
              <Badge variant="outline" className="text-xs bg-orange-50">
                Clicked: {stats.clicked}
              </Badge>
            )}
            {stats.bounced > 0 && (
              <Badge variant="outline" className="text-xs bg-red-50">
                Bounced: {stats.bounced}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Events Header & Filter */}
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-2 font-medium">
          <Activity className="h-4 w-4" />
          Campaign Events ({filteredEvents.length})
        </h4>
        <Select
          value={eventFilter}
          onValueChange={setEventFilter}
        >
          <SelectTrigger className="w-40">
            <Filter className="mr-2 h-3 w-3" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Events</SelectItem>
            <SelectItem value="SENT">Sent</SelectItem>
            <SelectItem value="DELIVERED">Delivered</SelectItem>
            <SelectItem value="OPENED">Opened</SelectItem>
            <SelectItem value="CLICKED">Clicked</SelectItem>
            <SelectItem value="BOUNCED">Bounced</SelectItem>
            <SelectItem value="COMPLAINED">Complained</SelectItem>
            <SelectItem value="UNSUBSCRIBED">Unsubscribed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Events List */}
      <div className="max-h-60 space-y-2 overflow-y-auto">
        {filteredEvents.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            No events found for the selected filter.
          </p>
        ) : (
          filteredEvents.map((event, index) => (
            <div
              key={event.id}
              className={`flex items-center justify-between rounded bg-gray-50 p-2 text-sm transition-all duration-300 ${
                index < 3 ? 'animate-pulse bg-blue-50' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <Badge className={getEventTypeColor(event.type)}>
                  {event.type}
                </Badge>
                <span className="text-muted-foreground">
                  {event.subscriber?.email || 'Unknown recipient'}
                </span>
                {event.subscriber?.firstName && (
                  <span className="text-muted-foreground">
                    ({event.subscriber.firstName}{' '}
                    {event.subscriber.lastName})
                  </span>
                )}
                {event.type === 'CLICKED' && event.data?.url && (
                  <span className="text-xs text-blue-600 truncate max-w-xs">
                    → {event.data.url}
                  </span>
                )}
              </div>
              <span className="text-muted-foreground text-xs">
                {format(new Date(event.createdAt), 'MMM d, HH:mm')}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}