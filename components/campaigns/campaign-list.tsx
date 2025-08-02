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
  Calendar,
  Mail,
  Send,
  Clock,
  Edit,
  Trash2,
  MoreHorizontal,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { z } from 'zod';

const campaignSchema = z.object({
  id: z.string(),
  name: z.string(),
  subject: z.string(),
  status: z.enum(['DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED']),
  recipientCount: z.number().nullable(),
  scheduledAt: z.string().datetime().nullable(),
  sentAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

type Campaign = z.infer<typeof campaignSchema>;

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

  const getStatusColor = (status: Campaign['status']) => {
    switch (status) {
      case 'SENT':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'SENDING':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'SCHEDULED':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'FAILED':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusLabel = (status: Campaign['status']) => {
    switch (status) {
      case 'DRAFT':
        return 'Draft';
      case 'SCHEDULED':
        return 'Scheduled';
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
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          All Campaigns
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {campaigns.length === 0 ? (
            <div className="text-center py-12">
              <Mail className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">
                No campaigns
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Get started by creating your first email campaign.
              </p>
            </div>
          ) : (
            campaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-lg">{campaign.name}</h3>
                      <Badge className={getStatusColor(campaign.status)}>
                        {getStatusLabel(campaign.status)}
                      </Badge>
                    </div>
                    
                    <p className="text-sm text-muted-foreground">
                      {campaign.subject}
                    </p>
                    
                    <div className="flex items-center gap-6 text-sm text-muted-foreground">
                      <span>
                        Recipients: {campaign.recipientCount ?? 0}
                      </span>
                      <span>
                        Created: {format(new Date(campaign.createdAt), 'MMM d, yyyy')}
                      </span>
                      {campaign.scheduledAt && (
                        <span>
                          Scheduled: {format(new Date(campaign.scheduledAt), 'MMM d, yyyy HH:mm')}
                        </span>
                      )}
                      {campaign.sentAt && (
                        <span>
                          Sent: {format(new Date(campaign.sentAt), 'MMM d, yyyy HH:mm')}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {campaign.status === 'DRAFT' && (
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
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-red-600">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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