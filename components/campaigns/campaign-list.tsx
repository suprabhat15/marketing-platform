// components/campaigns/campaign-list.tsx
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Mail,
  Send,
  Clock,
  Edit,
  Trash2,
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
  Activity,
  Filter,
  Search,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { z } from 'zod';

const eventSchema = z.object({
  id: z.string(),
  type: z.enum(['SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'COMPLAINED', 'UNSUBSCRIBED']),
  data: z.any().nullable(),
  createdAt: z.string().datetime(),
  subscriber: z.object({
    id: z.string(),
    email: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
  }).nullable(),
});

const campaignSchema = z.object({
  id: z.string(),
  name: z.string(),
  subject: z.string(),
  status: z.enum(['DRAFT', 'SENDING', 'SENT', 'FAILED']),
  latestStatus: z.enum(['DRAFT', 'SENDING', 'SENT', 'FAILED']),
  sentAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  latestCreatedAt: z.string().datetime(),
  list: z.object({
    id: z.string(),
    name: z.string(),
  }),
  template: z.object({
    id: z.string(),
    name: z.string(),
  }).nullable(),
  events: z.array(eventSchema),
  totalEvents: z.number(),
  campaignIds: z.array(z.string()),
  eventsByType: z.record(z.number()),
});

type Campaign = z.infer<typeof campaignSchema>;
type Event = z.infer<typeof eventSchema>;

interface CampaignListProps {
  campaigns: Campaign[];
  onSendCampaign: (campaignId: string, scheduleAt?: Date) => void;
  onRefresh: () => void;
}

export function CampaignList({
  campaigns,
  onSendCampaign,
  onRefresh,
}: CampaignListProps) {
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const [eventFilters, setEventFilters] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const toggleCampaignExpansion = (campaignId: string) => {
    const newExpanded = new Set(expandedCampaigns);
    if (newExpanded.has(campaignId)) {
      newExpanded.delete(campaignId);
    } else {
      newExpanded.add(campaignId);
    }
    setExpandedCampaigns(newExpanded);
  };

  const updateEventFilter = (campaignId: string, filter: string) => {
    setEventFilters(prev => ({
      ...prev,
      [campaignId]: filter === 'all' ? '' : filter,
    }));
  };

  const getFilteredEvents = (campaign: Campaign) => {
    const filter = eventFilters[campaign.id];
    if (!filter) return campaign.events;
    return campaign.events.filter(event => event.type === filter);
  };

  // Filter campaigns based on search query and status
  const filteredCampaigns = campaigns.filter(campaign => {
    const matchesSearch = searchQuery === '' || 
      campaign.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      campaign.subject.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || campaign.latestStatus === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: Campaign['status']) => {
    switch (status) {
      case 'SENT':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'SENDING':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'FAILED':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getEventTypeColor = (type: Event['type']) => {
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

  const getStatusLabel = (status: Campaign['status']) => {
    switch (status) {
      case 'DRAFT':
        return 'Draft';
      case 'SENDING':
        return 'Sending';
      case 'SENT':
        return 'Sent';
      case 'FAILED':
        return 'Failed';
      default:
        return status;
    }
  };

  const handleSchedule = () => {
    if (selectedCampaign && scheduleDate && scheduleTime) {
      const scheduleAt = new Date(`${scheduleDate}T${scheduleTime}`);
      onSendCampaign(selectedCampaign, scheduleAt);
      setScheduleDialogOpen(false);
      setSelectedCampaign(null);
      setScheduleDate('');
      setScheduleTime('');
    }
  };

  const openScheduleDialog = (campaignId: string) => {
    setSelectedCampaign(campaignId);
    setScheduleDialogOpen(true);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            All Campaigns ({filteredCampaigns.length})
          </CardTitle>

          <div className="flex items-center gap-3">
            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32">
                <Filter className="mr-2 h-3 w-3" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="SENDING">Sending</SelectItem>
                <SelectItem value="SENT">Sent</SelectItem>
                <SelectItem value="FAILED">Failed</SelectItem>
              </SelectContent>
            </Select>

            {/* Search Input */}
            <div className="relative">
              <Search className="text-muted-foreground absolute top-2.5 left-2 h-4 w-4" />
              <Input
                placeholder="Search campaigns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64 pl-8"
              />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {campaigns.length === 0 ? (
            <div className="py-12 text-center">
              <Mail className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">
                No campaigns
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Get started by creating your first email campaign.
              </p>
            </div>
          ) : filteredCampaigns.length === 0 ? (
            <div className="py-12 text-center">
              <Search className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">
                No campaigns found
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Try adjusting your search or filter criteria.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                }}
                className="mt-3"
              >
                Clear filters
              </Button>
            </div>
          ) : (
            filteredCampaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="hover:bg-background rounded-lg border p-4 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleCampaignExpansion(campaign.id)}
                        className="h-auto p-0"
                      >
                        {expandedCampaigns.has(campaign.id) ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                      <h3 className="text-lg font-semibold">{campaign.name}</h3>
                      <Badge className={getStatusColor(campaign.latestStatus)}>
                        {getStatusLabel(campaign.latestStatus)}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        <Activity className="mr-1 h-3 w-3" />
                        {campaign.totalEvents} events
                      </Badge>
                    </div>

                    <p className="text-muted-foreground text-sm">
                      {campaign.subject}
                    </p>

                    <div className="text-muted-foreground flex items-center gap-6 text-sm">
                      <span>List: {campaign.list.name}</span>
                      <span>
                        Created:{' '}
                        {format(new Date(campaign.createdAt), 'MMM d, yyyy')}
                      </span>
                      {campaign.sentAt && (
                        <span>
                          Sent:{' '}
                          {format(
                            new Date(campaign.sentAt),
                            'MMM d, yyyy HH:mm'
                          )}
                        </span>
                      )}
                    </div>

                    {/* Event Statistics */}
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(campaign.eventsByType).map(
                        ([type, count]) => (
                          <Badge
                            key={type}
                            variant="outline"
                            className={`text-xs ${getEventTypeColor(type as Event['type'])}`}
                          >
                            {type}: {count}
                          </Badge>
                        )
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {campaign.latestStatus === 'DRAFT' && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => onSendCampaign(campaign.id)}
                          className="flex items-center gap-1"
                        >
                          <Send className="h-3 w-3" />
                          Send Now
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openScheduleDialog(campaign.id)}
                          className="flex items-center gap-1"
                        >
                          <Clock className="h-3 w-3" />
                          Schedule
                        </Button>
                      </>
                    )}

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-red-600">
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Expanded Events Section */}
                {expandedCampaigns.has(campaign.id) && (
                  <div className="mt-4 border-t pt-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h4 className="flex items-center gap-2 font-medium">
                        <Activity className="h-4 w-4" />
                        Campaign Events ({getFilteredEvents(campaign).length})
                      </h4>
                      <Select
                        value={eventFilters[campaign.id] || 'all'}
                        onValueChange={(value) =>
                          updateEventFilter(campaign.id, value)
                        }
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
                          <SelectItem value="UNSUBSCRIBED">
                            Unsubscribed
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="max-h-60 space-y-2 overflow-y-auto">
                      {getFilteredEvents(campaign).length === 0 ? (
                        <p className="text-muted-foreground py-4 text-center text-sm">
                          No events found for the selected filter.
                        </p>
                      ) : (
                        getFilteredEvents(campaign).map((event) => (
                          <div
                            key={event.id}
                            className="flex items-center justify-between rounded bg-gray-50 p-2 text-sm"
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
                            </div>
                            <span className="text-muted-foreground text-xs">
                              {format(
                                new Date(event.createdAt),
                                'MMM d, HH:mm'
                              )}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>

      {/* Schedule Dialog */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="schedule-date">Date</Label>
              <Input
                id="schedule-date"
                type="date"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div>
              <Label htmlFor="schedule-time">Time</Label>
              <Input
                id="schedule-time"
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setScheduleDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleSchedule}>Schedule Campaign</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}