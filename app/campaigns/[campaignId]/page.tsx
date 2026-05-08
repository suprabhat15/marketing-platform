'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Users,
  CheckCircle2,
  Eye,
  MousePointer2,
  XCircle,
  Loader2,
  ArrowLeft,
  ExternalLink,
} from 'lucide-react';
import { format } from 'date-fns';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChartEvent {
  type: 'OPENED' | 'CLICKED';
  createdAt: string;
}

interface FailedDelivery {
  type: string;
  createdAt: string;
  email: string | null;
  name: string | null;
}

interface Campaign {
  id: string;
  name: string;
  subject: string;
  status: string;
  sentAt: string | null;
  list: { id: string; name: string };
  template: { id: string; name: string } | null;
  eventsByType: Record<string, number>;
  totalEvents: number;
  subscriberCount: number;
  chartEvents: ChartEvent[];
  failedDeliveries: FailedDelivery[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(num: number, denom: number) {
  if (!denom) return '0.0%';
  return `${((num / denom) * 100).toFixed(1)}%`;
}

function fmt(n: number) {
  return n.toLocaleString();
}

// ── Engagement chart (SVG) ────────────────────────────────────────────────────

function EngagementChart({
  events,
  sentAt,
}: {
  events: ChartEvent[];
  sentAt: string | null;
}) {
  const hourlyData = useMemo(() => {
    const base = sentAt ? new Date(sentAt) : new Date();
    const hours = Array.from({ length: 24 }, () => ({ opens: 0, clicks: 0 }));
    events.forEach((e) => {
      const h = Math.floor(
        (new Date(e.createdAt).getTime() - base.getTime()) / 3_600_000
      );
      if (h >= 0 && h < 24) {
        if (e.type === 'OPENED') hours[h].opens++;
        else if (e.type === 'CLICKED') hours[h].clicks++;
      }
    });
    return hours;
  }, [events, sentAt]);

  const maxTotal = Math.max(
    ...hourlyData.map((h) => h.opens + h.clicks),
    1
  );

  const BAR_H = 140;
  const BAR_W = 24;
  const GAP = 8;
  const PL = 4;
  const viewW = PL + 24 * (BAR_W + GAP);
  const viewH = BAR_H + 28;

  const xLabels = [
    { h: 0, label: '12am' },
    { h: 3, label: '3am' },
    { h: 6, label: '6am' },
    { h: 9, label: '9am' },
    { h: 12, label: '12pm' },
    { h: 15, label: '3pm' },
    { h: 18, label: '6pm' },
    { h: 21, label: '9pm' },
    { h: 23, label: '12am' },
  ];

  return (
    <svg viewBox={`0 0 ${viewW} ${viewH}`} className="w-full" style={{ maxHeight: 200 }}>
      {hourlyData.map((h, i) => {
        const x = PL + i * (BAR_W + GAP);
        const opensH = (h.opens / maxTotal) * BAR_H;
        const clicksH = (h.clicks / maxTotal) * BAR_H;
        const hasData = opensH > 0 || clicksH > 0;
        return (
          <g key={i}>
            {hasData ? (
              <>
                <rect
                  x={x}
                  y={BAR_H - opensH}
                  width={BAR_W}
                  height={opensH || 0}
                  fill="#e07346"
                  rx={3}
                />
                {clicksH > 0 && (
                  <rect
                    x={x}
                    y={BAR_H - opensH - clicksH}
                    width={BAR_W}
                    height={clicksH}
                    fill="#93c5fd"
                    rx={3}
                  />
                )}
              </>
            ) : (
              <rect x={x} y={BAR_H - 3} width={BAR_W} height={3} fill="#f3f4f6" rx={1} />
            )}
          </g>
        );
      })}
      {xLabels.map(({ h, label }) => (
        <text
          key={h}
          x={PL + h * (BAR_W + GAP) + BAR_W / 2}
          y={BAR_H + 20}
          textAnchor="middle"
          fontSize={9}
          fill="#9ca3af"
        >
          {label}
        </text>
      ))}
    </svg>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  sub,
  icon,
  valueClass = 'text-gray-900',
}: {
  title: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-start justify-between">
        <span className="text-sm text-gray-500">{title}</span>
        {icon}
      </div>
      <p className={`text-3xl font-bold ${valueClass}`}>{value}</p>
      <p className="mt-1.5 text-xs text-gray-400">{sub}</p>
    </div>
  );
}

// ── Deliverability row ────────────────────────────────────────────────────────

function DeliverRow({
  label,
  sub,
  value,
  valueClass,
  bg,
}: {
  label: string;
  sub: string;
  value: string;
  valueClass: string;
  bg: string;
}) {
  return (
    <div className={`flex items-center justify-between rounded-xl px-4 py-3 ${bg}`}>
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className="text-xs font-medium text-gray-500">{sub}</p>
      </div>
      <span className={`text-base font-bold ${valueClass}`}>{value}</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params?.campaignId as string;
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [tab, setTab] = useState<'overview' | 'failed'>('overview');

  const fetchCampaign = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`);
      if (res.ok) setCampaign((await res.json()).campaign);
    } catch (e) {
      console.error(e);
    }
  }, [campaignId]);

  useEffect(() => {
    if (campaignId) fetchCampaign();
  }, [campaignId, fetchCampaign]);

  if (!campaign) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
      </div>
    );
  }

  const ev = campaign.eventsByType;
  const recipients = campaign.subscriberCount;
  const delivered = ev['DELIVERED'] || 0;
  const denom = delivered || recipients; // fallback for open/click rate when DELIVERED not tracked
  const opened = ev['OPENED'] || 0;
  const clicked = ev['CLICKED'] || 0;
  const bounced = ev['BOUNCED'] || 0;
  const complained = ev['COMPLAINED'] || 0;
  const failedEvents = ev['FAILED'] || 0;
  const unsubscribed = ev['UNSUBSCRIBED'] || 0;
  const failed = bounced + complained + failedEvents;

  const failedDeliveries = campaign.failedDeliveries ?? [];
  const chartEvents = campaign.chartEvents ?? [];
  const inboxRate = parseFloat(pct(delivered, recipients));
  const reputationGood = inboxRate >= 95;

  return (
    <div className="-m-6 min-h-full bg-[#f5f3f0] p-6">
      <div className="space-y-6">
        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <button
              onClick={() => router.push('/campaigns')}
              className="mb-3 flex cursor-pointer items-center gap-1.5 text-sm text-gray-400 hover:text-gray-800"
            >
              <ArrowLeft className="h-4 w-4" />
              Campaigns
            </button>
            <h1 className="text-2xl font-bold text-gray-900">
              {campaign.name}
            </h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {campaign.list.name}
              {campaign.sentAt && (
                <> · Sent {format(new Date(campaign.sentAt), 'MMM d, yyyy')}</>
              )}
            </p>
          </div>
          <button className="mt-9 cursor-pointer rounded-xl border border-gray-200 bg-white px-5 py-2 text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50">
            Duplicate
          </button>
        </div>

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-5 gap-3">
          <StatCard
            title="Recipients"
            value={fmt(recipients)}
            sub="Total targeted"
            icon={<Users className="h-5 w-5 text-gray-300" />}
          />
          <StatCard
            title="Delivered"
            value={pct(delivered, recipients)}
            sub="Inbox rate"
            icon={<CheckCircle2 className="h-5 w-5 text-green-400" />}
            valueClass="text-green-600"
          />
          <StatCard
            title="Opened"
            value={pct(opened, denom)}
            sub={`${fmt(opened)} unique`}
            icon={<Eye className="h-5 w-5 text-orange-400" />}
            valueClass="text-orange-500"
          />
          <StatCard
            title="Clicked"
            value={pct(clicked, denom)}
            sub={`${fmt(clicked)} unique`}
            icon={<MousePointer2 className="h-5 w-5 text-blue-400" />}
            valueClass="text-blue-600"
          />
          <StatCard
            title="Failed"
            value={pct(failed, recipients)}
            sub="Bounced + complaints + failed"
            icon={<XCircle className="h-5 w-5 text-red-400" />}
            valueClass="text-red-500"
          />
        </div>

        {/* ── Tab container ── */}
        <div className="overflow-hidden rounded-2xl">
          {/* Tab bar — white */}
          <div className="flex items-center border-b border-gray-200 bg-white px-6">
            {[
              { key: 'overview' as const, label: 'Overview', badge: 0 },
              {
                key: 'failed' as const,
                label: 'Failed Deliveries',
                badge: failedDeliveries.length,
              },
            ].map(({ key, label, badge }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`relative mr-6 flex cursor-pointer items-center gap-1.5 py-4 text-sm font-medium transition-colors ${
                  tab === key
                    ? 'border-b-2 border-orange-500 text-orange-500'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {label}
                {badge > 0 && (
                  <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-600">
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="bg-[#f5f3f0] py-6">
            {tab === 'overview' ? (
              <div className="space-y-6">
                {/* Engagement chart */}
                <div className="rounded-2xl border bg-white p-6">
                  <div className="mb-4 flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-gray-900">
                        Engagement over time
                      </h3>
                      <p className="mt-0.5 text-sm text-gray-400">
                        Opens and clicks in the first 24 hours
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm bg-[#e07346]" />
                        Opens
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm bg-[#93c5fd]" />
                        Clicks
                      </span>
                    </div>
                  </div>
                  {chartEvents.length > 0 ? (
                    <EngagementChart
                      events={chartEvents}
                      sentAt={campaign.sentAt}
                    />
                  ) : (
                    <div className="flex h-40 items-center justify-center text-sm text-gray-400">
                      No engagement data yet
                    </div>
                  )}
                </div>

                {/* Two-col: details + deliverability */}
                <div className="grid grid-cols-2 gap-6">
                  {/* Campaign details */}
                  <div className="rounded-2xl border bg-white p-6">
                    <h3 className="mb-4 font-bold text-gray-900">
                      Campaign details
                    </h3>
                    <div className="divide-y divide-gray-200">
                      {/* Static rows */}
                      {[
                        { label: 'Subject line', value: campaign.subject },
                        {
                          label: 'Send time',
                          value: campaign.sentAt
                            ? format(
                                new Date(campaign.sentAt),
                                'MMM d, yyyy · h:mm a'
                              )
                            : '—',
                        },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex py-3">
                          <span className="w-28 shrink-0 text-sm font-medium text-gray-600">
                            {label}
                          </span>
                          <span className="text-sm font-medium text-gray-900">
                            {value}
                          </span>
                        </div>
                      ))}

                      {/* List row — with link icon */}
                      <div className="flex items-center py-3">
                        <span className="w-28 shrink-0 text-sm font-medium text-gray-600">
                          List
                        </span>
                        <span className="text-sm font-medium text-gray-900">
                          {campaign.list.name}
                        </span>
                        <button
                          onClick={() =>
                            router.push(`/lists/${campaign.list.id}`)
                          }
                          className="ml-auto cursor-pointer text-gray-400 hover:text-gray-700"
                          title="Open list"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Template row — with link icon */}
                      <div className="flex items-center py-3">
                        <span className="w-28 shrink-0 text-sm font-medium text-gray-600">
                          Template
                        </span>
                        <span className="text-sm font-medium text-gray-900">
                          {campaign.template?.name ?? 'NA'}
                        </span>
                        {campaign.template && (
                          <button
                            onClick={() =>
                              router.push(
                                `/templates/${campaign.template!.id}/edit`
                              )
                            }
                            className="ml-auto cursor-pointer text-gray-400 hover:text-gray-700"
                            title="Open template"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Deliverability breakdown */}
                  <div className="rounded-2xl border bg-white p-6">
                    <h3 className="mb-4 font-bold text-gray-900">
                      Deliverability breakdown
                    </h3>
                    <div className="space-y-2">
                      <DeliverRow
                        label="Delivered"
                        sub={`${fmt(delivered)} contacts`}
                        value={pct(delivered, recipients)}
                        valueClass="text-green-600"
                        bg="bg-green-50"
                      />
                      <DeliverRow
                        label="Bounced"
                        sub={`${fmt(bounced)} contacts`}
                        value={pct(bounced, recipients)}
                        valueClass="text-red-500"
                        bg="bg-red-50"
                      />
                      <DeliverRow
                        label="Complaints"
                        sub={`${fmt(complained)} contacts`}
                        value={pct(complained, recipients)}
                        valueClass="text-orange-500"
                        bg="bg-orange-50"
                      />
                      <DeliverRow
                        label="Unsubscribed"
                        sub={`${fmt(unsubscribed)} contacts`}
                        value={pct(unsubscribed, recipients)}
                        valueClass="text-gray-700"
                        bg="bg-gray-50"
                      />
                    </div>
                    {/* <div
                      className={`mt-3 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium ${
                        reputationGood
                          ? 'bg-green-50 text-green-700'
                          : 'bg-yellow-50 text-yellow-700'
                      }`}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {reputationGood
                        ? `Excellent sender reputation · ${pct(delivered, recipients)} inbox rate`
                        : `Inbox rate ${pct(delivered, recipients)} — review bounces`}
                    </div> */}
                  </div>
                </div>
              </div>
            ) : (
              /* ── Failed Deliveries tab ── */
              <div className="rounded-2xl border bg-white p-6">
                {failedDeliveries.length === 0 ? (
                  <div className="py-12 text-center text-sm text-gray-400">
                    No failed deliveries for this campaign.
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        {['Email', 'Name', 'Reason', 'Time'].map((h) => (
                          <th
                            key={h}
                            className="pb-3 text-left text-[11px] font-semibold tracking-wider text-gray-400 uppercase"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {failedDeliveries.map((fd, i) => (
                        <tr key={i} className="border-b border-gray-100">
                          <td className="py-3 font-medium text-gray-900">
                            {fd.email ?? '—'}
                          </td>
                          <td className="py-3 text-gray-500">
                            {fd.name ?? '—'}
                          </td>
                          <td className="py-3">
                            <span
                              className={`rounded px-2 py-0.5 text-[11px] font-bold uppercase ${
                                fd.type === 'BOUNCED'
                                  ? 'bg-red-100 text-red-700'
                                  : fd.type === 'COMPLAINED'
                                    ? 'bg-orange-100 text-orange-700'
                                    : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {fd.type}
                            </span>
                          </td>
                          <td className="py-3 text-gray-500">
                            {format(new Date(fd.createdAt), 'MMM d, h:mm a')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
