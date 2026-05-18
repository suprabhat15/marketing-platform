// components/campaigns/campaign-dashboard.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Mail, BarChart2, Sparkles, ArrowRight, Plus } from 'lucide-react';
import { CampaignList } from './campaign-list';
import { NewCampaignModal } from './new-campaign-modal';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import { globalSSEManager } from '@/lib/global-sse-manager';
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

const statsSchema = z.object({
  total: z.number(),
  sent: z.number(),
  draft: z.number(),
  totalEvents: z.number(),
});

type Campaign = z.infer<typeof campaignSchema>;
type Stats = z.infer<typeof statsSchema>;

function formatEmailCount(n: number) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return n.toString();
}

function StatCard({
  title,
  value,
  sub,
  icon,
}: {
  title: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <p className="text-sm text-gray-500">{title}</p>
        <span className="text-gray-300">{icon}</span>
      </div>
      <p className="mt-4 text-4xl font-bold tracking-tight text-gray-900">
        {value}
      </p>
      <p className="mt-1.5 text-sm text-gray-400">{sub}</p>
    </div>
  );
}

export function CampaignDashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    sent: 0,
    draft: 0,
    totalEvents: 0,
  });
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const router = useRouter();
  const { data: session } = useSession();

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const activeCampaigns = useMemo(() => {
    return campaigns.filter((c) => c.status === 'SENDING' || c.status === 'QUEUED');
  }, [campaigns]);

  useEffect(() => {
    if (!session?.user?.id || activeCampaigns.length === 0) return;

    const unsubscribers: (() => void)[] = [];

    activeCampaigns.forEach((campaign) => {
      const unsubscribe = globalSSEManager.subscribe(
        campaign.id,
        session.user.id,
        (data) => {
          if (
            data.type === 'campaign_status_update' &&
            data.campaignId === campaign.id
          ) {
            setCampaigns((prev) =>
              prev.map((c) =>
                c.id === campaign.id
                  ? {
                      ...c,
                      status: data.status,
                      latestStatus: data.status,
                      sentAt: data.data?.sentAt || c.sentAt,
                    }
                  : c
              )
            );
            if (data.status === 'SENT') {
              setStats((prev) => ({ ...prev, sent: prev.sent + 1 }));
            }
          }
        }
      );
      unsubscribers.push(unsubscribe);
    });

    return () => unsubscribers.forEach((u) => u());
  }, [session?.user?.id, activeCampaigns]);

  const computedStats = useMemo(() => {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const sentCampaigns = campaigns.filter((c) => c.sentAt);
    const thisMonth = sentCampaigns.filter((c) => new Date(c.sentAt!) >= thisMonthStart);
    const lastMonth = sentCampaigns.filter(
      (c) => new Date(c.sentAt!) >= lastMonthStart && new Date(c.sentAt!) <= lastMonthEnd
    );

    function agg(list: Campaign[]) {
      let opened = 0, clicked = 0, delivered = 0, emails = 0;
      list.forEach((c) => {
        opened += c.eventsByType['OPENED'] ?? 0;
        clicked += c.eventsByType['CLICKED'] ?? 0;
        delivered += c.eventsByType['DELIVERED'] || c.eventsByType['SENT'] || 0;
        emails += c.eventsByType['SENT'] || c.eventsByType['DELIVERED'] || 0;
      });
      return { opened, clicked, delivered, emails };
    }

    const all = agg(campaigns);
    const cur = agg(thisMonth);
    const prev = agg(lastMonth);

    const avgOpenRate = all.delivered > 0 ? (all.opened / all.delivered) * 100 : 0;
    const avgClickRate = all.delivered > 0 ? (all.clicked / all.delivered) * 100 : 0;

    const curOpenRate = cur.delivered > 0 ? (cur.opened / cur.delivered) * 100 : null;
    const prevOpenRate = prev.delivered > 0 ? (prev.opened / prev.delivered) * 100 : null;
    const curClickRate = cur.delivered > 0 ? (cur.clicked / cur.delivered) * 100 : null;
    const prevClickRate = prev.delivered > 0 ? (prev.clicked / prev.delivered) * 100 : null;

    function pctChange(a: number, b: number) {
      if (b === 0) return null;
      return ((a - b) / b) * 100;
    }

    function fmtPctChange(v: number | null, suffix = '% vs last month') {
      if (v === null) return 'No last-month data';
      const arrow = v >= 0 ? '↑' : '↓';
      return `${arrow} ${Math.abs(v).toFixed(1)}${suffix}`;
    }

    function fmtPpChange(cur: number | null, prev: number | null) {
      if (cur === null || prev === null) return 'No last-month data';
      const diff = cur - prev;
      const arrow = diff >= 0 ? '↑' : '↓';
      return `${arrow} ${Math.abs(diff).toFixed(1)}pp vs last month`;
    }

    return {
      avgOpenRate,
      avgClickRate,
      sentThisMonth: thisMonth.length,
      emailsSub: fmtPctChange(pctChange(cur.emails, prev.emails)),
      openRateSub: fmtPpChange(curOpenRate, prevOpenRate),
      clickRateSub: fmtPpChange(curClickRate, prevClickRate),
    };
  }, [campaigns]);

  const fetchCampaigns = async () => {
    try {
      const response = await fetch('/api/campaigns');
      const data = await response.json();
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

  const handleDelete = async (campaignId: string) => {
    try {
      const campaign = campaigns.find((c) => c.id === campaignId);
      const idsToDelete = campaign?.campaignIds ?? [campaignId];

      await Promise.all(
        idsToDelete.map((id) =>
          fetch(`/api/campaigns/${id}`, { method: 'DELETE' })
        )
      );

      setCampaigns((prev) => prev.filter((c) => c.id !== campaignId));
      setStats((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }));
    } catch (error) {
      console.error('Error deleting campaign:', error);
    }
  };

  const handleSendCampaign = async (campaignId: string, scheduleAt?: Date) => {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduleAt: scheduleAt?.toISOString() }),
      });
      if (response.ok) fetchCampaigns();
    } catch (error) {
      console.error('Error sending campaign:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Campaigns</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create, send, and track your email campaigns
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex cursor-pointer items-center gap-2 rounded-full bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
        >
          <Plus className="h-4 w-4" />
          New Campaign
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          title="Total Campaigns"
          value={stats.total.toString()}
          sub={`${computedStats.sentThisMonth} sent this month`}
          icon={<Mail className="h-5 w-5" />}
        />
        <StatCard
          title="Emails Sent"
          value={formatEmailCount(stats.totalEvents)}
          sub={computedStats.emailsSub}
          icon={<BarChart2 className="h-5 w-5" />}
        />
        <StatCard
          title="Avg. Open Rate"
          value={`${computedStats.avgOpenRate.toFixed(1)}%`}
          sub={computedStats.openRateSub}
          icon={<Sparkles className="h-5 w-5" />}
        />
        <StatCard
          title="Avg. Click Rate"
          value={`${computedStats.avgClickRate.toFixed(1)}%`}
          sub={computedStats.clickRateSub}
          icon={<ArrowRight className="h-5 w-5" />}
        />
      </div>

      {/* Campaign List */}
      <CampaignList
        campaigns={campaigns}
        onSendCampaign={handleSendCampaign}
        handleDelete={handleDelete}
      />

      <NewCampaignModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={fetchCampaigns}
      />
    </div>
  );
}
