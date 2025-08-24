// components/campaigns/campaign-dashboard.tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
// import { Badge } from '@/components/ui/badge';
import { Mail, Users, TrendingUp, Plus } from 'lucide-react';
import { CampaignRealTimeEvents } from './campaign-real-time-events';
import { CampaignList } from './campaign-list';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
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
    'UNSUBSCRIBED',
  ]),
  data: z.any().nullable(),
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
  status: z.enum(['DRAFT', 'QUEUED', 'SENDING', 'SENT', 'FAILED']),
  latestStatus: z.enum(['DRAFT', 'QUEUED', 'SENDING', 'SENT', 'FAILED']),
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

const statsSchema = z.object({
  total: z.number(),
  sent: z.number(),
  draft: z.number(),
  totalEvents: z.number(),
});

type Campaign = z.infer<typeof campaignSchema>;
type Stats = z.infer<typeof statsSchema>;

export function CampaignDashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    sent: 0,
    draft: 0,
    totalEvents: 0,
  });
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { data: session } = useSession();

  useEffect(() => {
    fetchCampaigns();
  }, []);

  // Set up SSE connection to listen for campaign status updates
  useEffect(() => {
    if (!session?.user?.id || campaigns.length === 0) return;

    const eventSources: EventSource[] = [];
    const activeCampaigns = campaigns.filter(
      (c) =>
        c.status === 'SENDING' || c.status === 'QUEUED' || c.status === 'SENT'
    );

    console.log(
      `Setting up SSE for ${activeCampaigns.length} active campaigns:`,
      activeCampaigns.map((c) => `${c.name} (${c.status})`)
    );

    // Set up SSE for each active campaign
    activeCampaigns.forEach((campaign) => {
      const eventSource = new EventSource(
        `/api/events/stream?campaignId=${campaign.id}&userId=${session.user.id}`
      );

      console.log(
        `SSE connection established for campaign: ${campaign.name} (${campaign.id})`
      );

      eventSource.onopen = () => {
        console.log(`SSE connection opened for campaign: ${campaign.name}`);
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('SSE event received:', data);

          if (data.type === 'campaign_status_update') {
            console.log(
              `Campaign ${data.campaignId} status update: ${data.status}`
            );

            // Update the campaign status in real-time
            setCampaigns((prevCampaigns) => {
              const updated = prevCampaigns.map((c) =>
                c.id === data.campaignId
                  ? {
                      ...c,
                      status: data.status,
                      latestStatus: data.status,
                      sentAt: data.data?.sentAt || c.sentAt,
                    }
                  : c
              );
              console.log(
                'Updated campaigns:',
                updated.find((c) => c.id === data.campaignId)
              );
              return updated;
            });

            // Update stats if campaign changed to SENT
            if (data.status === 'SENT') {
              setStats((prevStats) => ({
                ...prevStats,
                sent: prevStats.sent + 1,
              }));
            }
          }
        } catch (error) {
          console.error('Error parsing SSE event:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error(`SSE error for campaign ${campaign.name}:`, error);
        eventSource.close();
      };

      eventSources.push(eventSource);
    });

    return () => {
      console.log('Closing SSE connections');
      eventSources.forEach((source) => source.close());
    };
  }, [session?.user?.id, campaigns]);

  const fetchCampaigns = async () => {
    try {
      const response = await fetch('/api/campaigns');
      const data = await response.json();
      // console.log('data', data);
      setCampaigns(
        data.campaigns.map((c: Campaign) => campaignSchema.parse(c))
      );
      setStats(statsSchema.parse(data.stats));
    } catch (error) {
      console.error('Error fetching campaigns:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendCampaign = async (campaignId: string, scheduleAt?: Date) => {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleAt: scheduleAt?.toISOString(),
        }),
      });

      if (response.ok) {
        fetchCampaigns();
      }
    } catch (error) {
      console.error('Error sending campaign:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Campaigns</h1>
          <p className="text-muted-foreground">
            Manage and track your email campaigns
          </p>
        </div>
        <Button onClick={() => router.push('/campaigns/new')}>
          <Plus className="mr-2 h-4 w-4" />
          New Campaign
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Campaigns
            </CardTitle>
            <Mail className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sent</CardTitle>
            <TrendingUp className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {stats.sent}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Drafts</CardTitle>
            <Users className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600">
              {stats.draft}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Campaign List */}
      <CampaignList
        campaigns={campaigns}
        onSendCampaign={handleSendCampaign}
        onRefresh={fetchCampaigns}
      />
    </div>
  );
}