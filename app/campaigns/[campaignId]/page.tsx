'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { ArrowLeft, CalendarIcon, UsersIcon, FilterIcon, Search, Loader2, Activity, Wifi, WifiOff } from 'lucide-react';
import { format } from 'date-fns';
import { useCampaignEvents } from '@/hooks/use-campaign-events';
import { useSession } from '@/lib/auth-client';

interface Event {
  id: string;
  type: 'SENT' | 'DELIVERED' | 'OPENED' | 'CLICKED' | 'BOUNCED' | 'COMPLAINED' | 'UNSUBSCRIBED';
  createdAt: string;
  subscriber: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
}

interface Campaign {
  id: string;
  name: string;
  subject: string;
  content?: string;
  status: 'DRAFT' | 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED';
  createdAt: string;
  sentAt: string | null;
  list: {
    id: string;
    name: string;
  };
  template: {
    id: string;
    name: string;
    html?: string;
    content?: string;
  } | null;
  eventsByType: Record<string, number>;
  totalEvents: number;
  subscriberCount: number;
}

interface PaginatedEventsResponse {
  events: Event[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasMore: boolean;
    hasPrevious: boolean;
  };
}

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params?.campaignId as string;
  const { data: session } = useSession();
  
  // Debug logging for SSE connection issues
  useEffect(() => {
    console.log(`📋 Campaign page state changed:`, {
      campaignId,
      userId: session?.user?.id,
      hasSession: !!session,
      hasUserId: !!session?.user?.id
    });
  }, [campaignId, session?.user?.id, session]);

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    totalCount: 0,
    totalPages: 0,
    hasMore: false,
    hasPrevious: false,
  });
  const [pageSize, setPageSize] = useState(25);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  // Refs for batching/debouncing
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // SSE connection for real-time events
  // Only enable SSE when we have both campaignId and userId
  const userId = session?.user?.id;
  const sseEnabled = !!(campaignId && userId);
  
  // Stabilize callback functions to prevent re-renders
  const onEventCallback = useCallback((event: any) => {
    // Add new event to the current page if it matches filters
    const matchesFilter = statusFilter === 'all' || event.type === statusFilter;
    const matchesSearch = !searchTerm || 
      event.subscriber?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `${event.subscriber?.firstName || ''} ${event.subscriber?.lastName || ''}`.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (matchesFilter && matchesSearch && pagination.page === 1) {
      // Add to beginning of events list if on first page
      setEvents(prev => [event, ...prev].slice(0, pageSize));
    }
    
    // Update campaign stats incrementally for immediate UI feedback
    setCampaign(prev => {
      if (!prev) return null;
      
      const newEventsByType = { ...prev.eventsByType };
      newEventsByType[event.type] = (newEventsByType[event.type] || 0) + 1;
      
      return {
        ...prev,
        eventsByType: newEventsByType,
        totalEvents: prev.totalEvents + 1
      };
    });
  }, [statusFilter, searchTerm, pagination.page, pageSize]);

  const onStatsUpdateCallback = useCallback((stats: any) => {
    // Update campaign stats directly from SSE data (more efficient)
    setCampaign(prev => prev ? {
      ...prev,
      eventsByType: stats.eventsByType,
      totalEvents: stats.totalEvents,
      status: stats.campaign.status as any,
      sentAt: stats.campaign.sentAt || prev.sentAt
    } : null);
  }, []);

  const { isConnected: sseConnected } = useCampaignEvents(campaignId, userId || '', {
    enabled: sseEnabled,
    onEvent: onEventCallback,
    onStatsUpdate: onStatsUpdateCallback
  });

  const fetchCampaign = useCallback(async () => {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}`);
      if (response.ok) {
        const data = await response.json();
        setCampaign(data.campaign);
      }
    } catch (error) {
      console.error('Error fetching campaign:', error);
    }
  }, [campaignId]);

  // Core fetch function without debouncing
  const fetchEventsCore = useCallback(async (page: number = 1, search: string = '', status: string = 'all', limit: number = pageSize, showLoader: boolean = false) => {
    if (showLoader) setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      
      if (search.trim()) {
        params.set('search', search.trim());
      }
      
      if (status && status !== 'all') {
        params.set('status', status);
      }

      const response = await fetch(`/api/campaigns/${campaignId}/events?${params}`);
      if (response.ok) {
        const data: PaginatedEventsResponse = await response.json();
        setEvents(data.events);
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [campaignId, pageSize]);

  // Debounced fetch function with 500ms delay
  const fetchEvents = useCallback((page: number = 1, search: string = '', status: string = 'all', limit: number = pageSize, immediate: boolean = false, showLoader: boolean = false) => {
    // Clear existing timeout
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }

    if (immediate) {
      // Fetch immediately for certain operations
      fetchEventsCore(page, search, status, limit, showLoader);
    } else {
      // Batch with 500ms delay for search/filter changes
      fetchTimeoutRef.current = setTimeout(() => {
        fetchEventsCore(page, search, status, limit, showLoader);
      }, 500);
    }
  }, [fetchEventsCore, pageSize]);

  // Initial load effect
  useEffect(() => {
    if (!campaignId) return;
    fetchCampaign();
    fetchEvents(1, searchTerm, statusFilter, pageSize, true, true); // Show loader on initial load
  }, [campaignId]); // Only depend on campaignId

  // Effect for search changes with debouncing
  useEffect(() => {
    if (searchTerm) {
      // Use debounced fetch for search changes
      fetchEvents(1, searchTerm, statusFilter, pageSize, false, false);
    } else {
      // If search is cleared, fetch immediately
      fetchEvents(1, searchTerm, statusFilter, pageSize, true, false);
    }
  }, [searchTerm, fetchEvents, pageSize, statusFilter]);

  // Effect for status filter changes (immediate)
  useEffect(() => {
    // Status filter changes should be immediate
    fetchEvents(1, searchTerm, statusFilter, pageSize, true, false);
  }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Effect for page size changes (immediate)
  useEffect(() => {
    if (pageSize !== 25) { // Only if pageSize changed from default
      fetchEvents(1, searchTerm, statusFilter, pageSize, true, false);
    }
  }, [pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
    };
  }, []);

  const handlePageChange = (page: number) => {
    // Pagination should be immediate
    fetchEvents(page, searchTerm, statusFilter, pageSize, true, false);
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    // Reset to page 1 when changing page size - immediate
    fetchEvents(1, searchTerm, statusFilter, newPageSize, true, false);
  };

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
  }, []);

  const handleStatusFilterChange = useCallback((value: string) => {
    setStatusFilter(value);
  }, []);

  const getStatusColor = (status: Campaign['status']) => {
    switch (status) {
      case 'SENT':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'SENDING':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'QUEUED':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'DRAFT':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'FAILED':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getEventStatusColor = (status: Event['type']) => {
    switch (status) {
      case 'SENT':
        return 'bg-blue-100 text-blue-800';
      case 'DELIVERED':
        return 'bg-green-100 text-green-800';
      case 'OPENED':
        return 'bg-purple-100 text-purple-800';
      case 'CLICKED':
        return 'bg-indigo-100 text-indigo-800';
      case 'BOUNCED':
        return 'bg-red-100 text-red-800';
      case 'COMPLAINED':
        return 'bg-orange-100 text-orange-800';
      case 'UNSUBSCRIBED':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (!campaign) {
    return (
      <div className="flex h-screen bg-background">
        <main className="flex-1 overflow-auto p-6">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <main className="flex-1 overflow-auto">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/campaigns')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Campaigns
            </Button>
          </div>

          {/* Campaign Details Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">{campaign.name}</CardTitle>
              <CardDescription>{campaign.subject}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Badge className={getStatusColor(campaign.status)}>
                  {campaign.status}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  List: {campaign.list.name}
                </span>
                <span className="text-sm text-muted-foreground">
                  Created: {format(new Date(campaign.createdAt), 'MMM d, yyyy')}
                </span>
                {campaign.sentAt && (
                  <span className="text-sm text-muted-foreground">
                    Sent: {format(new Date(campaign.sentAt), 'MMM d, yyyy HH:mm')}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Campaign Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Badge className={getStatusColor(campaign.status)} variant="outline">
                    <div className="w-2 h-2 rounded-full mr-2" />
                    Status
                  </Badge>
                  <div>
                    <div className="text-2xl font-bold">
                      {campaign.status === 'SENT' ? 'Completed' : campaign.status}
                    </div>
                    <p className="text-xs text-muted-foreground">Campaign Status</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <UsersIcon className="h-8 w-8 text-green-600" />
                  <div>
                    <div className="text-2xl font-bold">{campaign.subscriberCount.toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground">Recipients</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Activity className="h-8 w-8 text-blue-600" />
                  <div>
                    <div className="text-2xl font-bold">{campaign.totalEvents.toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground">Total Events</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <CalendarIcon className="h-8 w-8 text-purple-600" />
                  <div>
                    <div className="text-2xl font-bold">
                      {format(new Date(campaign.createdAt), 'MMM d')}
                    </div>
                    <p className="text-xs text-muted-foreground">Created</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Event Statistics */}
          <Card>
            <CardHeader>
              <CardTitle>Event Statistics</CardTitle>
              <CardDescription>Breakdown of events by type</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                {Object.entries(campaign.eventsByType).map(([type, count]) => (
                  <div key={type} className="text-center">
                    <div className="text-2xl font-bold">{count.toLocaleString()}</div>
                    <Badge className={getEventStatusColor(type as Event['type'])} variant="secondary">
                      {type}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Events Dashboard */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Events Dashboard</h2>
            </div>

            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="flex items-center gap-2">
                    <FilterIcon className="h-5 w-5" />
                    Campaign Events
                    {sseConnected ? (
                      <div className="flex items-center gap-1 text-sm text-green-600">
                        <Wifi className="w-3 h-3" />
                        Live
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-sm text-amber-600">
                        <WifiOff className="w-3 h-3" />
                        Offline
                      </div>
                    )}
                  </CardTitle>
                  <div className="flex gap-2">
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by email or name..."
                        value={searchTerm}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        className="pl-8"
                      />
                    </div>
                    <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
                      <SelectTrigger className="w-40">
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
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                          <p className="text-muted-foreground mt-2">Loading events...</p>
                        </TableCell>
                      </TableRow>
                    ) : events.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          {searchTerm || statusFilter !== 'all' 
                            ? 'No events match your filters' 
                            : 'No events yet'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      events.map((event) => (
                        <TableRow key={event.id}>
                          <TableCell>
                            <Badge className={getEventStatusColor(event.type)} variant="secondary">
                              {event.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">
                            {event.subscriber?.email || 'Unknown'}
                          </TableCell>
                          <TableCell>
                            {event.subscriber?.firstName || event.subscriber?.lastName
                              ? `${event.subscriber.firstName || ''} ${event.subscriber.lastName || ''}`.trim()
                              : '-'}
                          </TableCell>
                          <TableCell>
                            {format(new Date(event.createdAt), 'MMM d, yyyy HH:mm')}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                
                {/* Pagination and Page Size Controls */}
                {!loading && (
                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Rows per page:</span>
                      <Select
                        value={pageSize.toString()}
                        onValueChange={(value) => handlePageSizeChange(parseInt(value))}
                      >
                        <SelectTrigger className="w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="25">25</SelectItem>
                          <SelectItem value="100">100</SelectItem>
                          <SelectItem value="200">200</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {pagination.totalPages > 1 && (
                      <Pagination
                        currentPage={pagination.page}
                        totalPages={pagination.totalPages}
                        onPageChange={handlePageChange}
                        totalCount={pagination.totalCount}
                        itemsPerPage={pagination.limit}
                      />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}