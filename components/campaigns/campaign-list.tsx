// components/campaigns/campaign-list.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { format } from 'date-fns';
import { z } from 'zod';

const eventSchema = z.object({
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
  createdAt: z.string().datetime(),
});

const campaignSchema = z.object({
  id: z.string(),
  name: z.string(),
  subject: z.string(),
  status: z.enum([
    'DRAFT',
    'SCHEDULED',
    'QUEUED',
    'SENDING',
    'SENT',
    'COMPLETED',
    'CANCELLED',
    'FAILED',
  ]),
  latestStatus: z.enum([
    'DRAFT',
    'SCHEDULED',
    'QUEUED',
    'SENDING',
    'SENT',
    'COMPLETED',
    'CANCELLED',
    'FAILED',
  ]),
  sentAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  latestCreatedAt: z.string().datetime(),
  list: z.object({ id: z.string(), name: z.string() }),
  template: z.object({ id: z.string(), name: z.string() }).nullable(),
  events: z.array(eventSchema),
  totalEvents: z.number(),
  campaignIds: z.array(z.string()),
  eventsByType: z.record(z.number()),
});

type Campaign = z.infer<typeof campaignSchema>;

interface CampaignListProps {
  campaigns: Campaign[];
  onSendCampaign: (campaignId: string, scheduleAt?: Date) => void;
  handleDelete: (campaignId: string) => void;
}

const STATUS_STYLES: Record<Campaign['status'], string> = {
  SENT: 'bg-green-100 text-green-700 border-green-200',
  COMPLETED: 'bg-green-100 text-green-700 border-green-200',
  SCHEDULED: 'bg-sky-100 text-sky-700 border-sky-200',
  SENDING: 'bg-blue-100 text-blue-700 border-blue-200',
  QUEUED: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  DRAFT: 'bg-gray-100 text-gray-600 border-gray-200',
  CANCELLED: 'bg-gray-100 text-gray-500 border-gray-200',
  FAILED: 'bg-red-100 text-red-700 border-red-200',
};

function StatusBadge({ status }: { status: Campaign['status'] }) {
  return (
    <span
      className={`inline-block rounded border px-2 py-0.5 text-[11px] font-bold tracking-wider uppercase ${STATUS_STYLES[status] ?? STATUS_STYLES.DRAFT}`}
    >
      {status}
    </span>
  );
}

function getDenominator(campaign: Campaign): number {
  // Use || so a 0-value DELIVERED falls through to SENT, then to 0
  return campaign.eventsByType['DELIVERED'] || campaign.eventsByType['SENT'] || 0;
}

function getOpenRate(campaign: Campaign): string {
  const opened = campaign.eventsByType['OPENED'] ?? 0;
  const denom = getDenominator(campaign);
  if (denom > 0) return `${((opened / denom) * 100).toFixed(1)}%`;
  // Denominator unknown but opens were tracked — show raw count
  if (opened > 0) return `${opened} open${opened !== 1 ? 's' : ''}`;
  return '—';
}

function getClickRate(campaign: Campaign): string {
  const clicked = campaign.eventsByType['CLICKED'] ?? 0;
  const denom = getDenominator(campaign);
  if (denom > 0) return `${((clicked / denom) * 100).toFixed(1)}%`;
  if (clicked > 0) return `${clicked} click${clicked !== 1 ? 's' : ''}`;
  return '—';
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

  const handleSchedule = () => {
    if (selectedCampaign && scheduleDate && scheduleTime) {
      onSendCampaign(
        selectedCampaign,
        new Date(`${scheduleDate}T${scheduleTime}`)
      );
      setScheduleDialogOpen(false);
      setSelectedCampaign(null);
      setScheduleDate('');
      setScheduleTime('');
    }
  };

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {/* Section header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
          <h2 className="text-lg font-bold text-gray-900">All Campaigns</h2>
        </div>

        {campaigns.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-gray-400">
              No campaigns yet. Create your first campaign.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-6 py-3 text-left text-[11px] font-semibold tracking-wider text-gray-400 uppercase">
                  Campaign
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold tracking-wider text-gray-400 uppercase">
                  List
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold tracking-wider text-gray-400 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold tracking-wider text-gray-400 uppercase">
                  Sent
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold tracking-wider text-gray-400 uppercase">
                  Opens
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold tracking-wider text-gray-400 uppercase">
                  Clicks
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign, i) => {
                const openRate = getOpenRate(campaign);
                const clickRate = getClickRate(campaign);
                const isDraft = campaign.latestStatus === 'DRAFT';

                return (
                  <tr
                    key={campaign.id}
                    className={`transition-colors hover:bg-gray-50/60 ${i < campaigns.length - 1 ? 'border-b border-gray-100' : ''}`}
                  >
                    <td className="px-6 py-4">
                      <span className="font-semibold text-gray-900">
                        {campaign.name}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-gray-500">
                      {campaign.list.name}
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge status={campaign.latestStatus} />
                    </td>
                    <td className="px-4 py-4 text-gray-700">
                      {campaign.sentAt ? (
                        <span>
                          {format(new Date(campaign.sentAt), 'MMM d')}
                          <span className="ml-1 text-xs text-gray-400">
                            {format(new Date(campaign.sentAt), 'h:mm a')}
                          </span>
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-4 font-semibold text-gray-900">
                      {openRate}
                    </td>
                    <td className="px-4 py-4 font-semibold text-gray-900">
                      {clickRate}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() =>
                            router.push(`/campaigns/${campaign.id}`)
                          }
                          className="cursor-pointer font-medium text-orange-500 hover:text-orange-600"
                        >
                          View
                        </button>
                        {isDraft && (
                          <button
                            onClick={() =>
                              router.push(`/campaigns/${campaign.id}`)
                            }
                            className="cursor-pointer font-medium text-gray-700 hover:text-gray-900"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

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
    </>
  );
}
