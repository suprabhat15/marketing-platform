// components/campaigns/campaign-list.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
  // MoreHorizontal,
  Activity,
  Filter,
  Search,
} from 'lucide-react';
import { format } from 'date-fns';
// import {
//   DropdownMenu,
//   DropdownMenuContent,
//   DropdownMenuItem,
//   DropdownMenuTrigger,
// } from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
// import {
//   AlertDialog,
//   AlertDialogAction,
//   AlertDialogCancel,
//   AlertDialogContent,
//   AlertDialogDescription,
//   AlertDialogFooter,
//   AlertDialogHeader,
//   AlertDialogTitle,
//   AlertDialogTrigger,
// } from '@/components/ui/alert-dialog';

import { z } from 'zod';

const eventSchema = z.object({
  id: z.string(),
  type: z.enum([
    'SENT',
    'DELIVERED',
    'OPENED',
    'CLICKED',
    'BOUNCED',
    'COMPLAINED',
    'FAILED',
    'SUPPRESSED',
    'UNSUBSCRIBED',
  ]),
  data: z.any().optional(),
  createdAt: z.string().datetime(),
  subscriber: z
    .object({
      id: z.string(),
      email: z.string(),
      firstName: z.string().nullable(),
      lastName: z.string().nullable(),
    })
    .nullable(),
});

const campaignSchema = z.object({
  id: z.string(),
  name: z.string(),
  subject: z.string(),
  status: z.enum(['DRAFT', 'SCHEDULED', 'QUEUED', 'SENDING', 'SENT', 'COMPLETED', 'CANCELLED', 'FAILED']),
  latestStatus: z.enum(['DRAFT', 'SCHEDULED', 'QUEUED', 'SENDING', 'SENT', 'COMPLETED', 'CANCELLED', 'FAILED']),
  sentAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  latestCreatedAt: z.string().datetime(),
  list: z.object({
    id: z.string(),
    name: z.string(),
  }),
  template: z
    .object({
      id: z.string(),
      name: z.string(),
    })
    .nullable(),
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
  handleDelete: (campaignId: string) => void;
}

export function CampaignList({
  campaigns,
  onSendCampaign,
  handleDelete,
}: CampaignListProps) {
  const router = useRouter();
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Filter campaigns based on search query and status
  const filteredCampaigns = campaigns.filter((campaign) => {
    const matchesSearch =
      searchQuery === '' ||
      campaign.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      campaign.subject.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' || campaign.latestStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: Campaign['status']) => {
    switch (status) {
      case 'SENT':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'SENDING':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'QUEUED':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
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
      case 'QUEUED':
        return 'Queued';
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
                <SelectItem value="QUEUED">Queued</SelectItem>
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
                className="cursor-pointer rounded-lg border p-4 transition-colors hover:bg-gray-50"
                onClick={() => router.push(`/campaigns/${campaign.id}`)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3">
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

                  <div
                    className="flex items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {campaign.latestStatus === 'DRAFT' && (
                      <>
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSendCampaign(campaign.id);
                          }}
                          className="flex items-center gap-1"
                        >
                          <Send className="h-3 w-3" />
                          Send Now
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            openScheduleDialog(campaign.id);
                          }}
                          className="flex items-center gap-1"
                        >
                          <Clock className="h-3 w-3" />
                          Schedule
                        </Button>
                      </>
                    )}

                    {/* <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem
                          onClick={() =>
                            router.push(`/campaigns/${campaign.id}`)
                          }
                        >
                          <Activity className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-red-600">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                title="Delete List"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  handleDelete(campaign.id);
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Are you sure?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  This action cannot be undone. This will
                                  permanently delete the list &quot;
                                  {campaign.name}
                                  &quot; and all its subscribers.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(campaign.id)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  Delete List
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu> */}

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          router.push(`/campaigns/${campaign.id}`);
                        }}
                        className="flex cursor-pointer items-center gap-1"
                      >
                        <Edit className="h-3 w-3" />
                        Edit
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          handleDelete(campaign.id);
                        }}
                        className="flex cursor-pointer items-center gap-1 text-red-600"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
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