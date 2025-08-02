'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Mail, 
  Eye, 
  MousePointer, 
  AlertTriangle, 
  UserMinus, 
  TrendingUp,
  TrendingDown,
  Calendar
} from 'lucide-react';
import { z } from 'zod';

const campaignStatsSchema = z.object({
  campaignId: z.string(),
  campaignName: z.string(),
  sentCount: z.number(),
  deliveredCount: z.number(),
  openedCount: z.number(),
  clickedCount: z.number(),
  bouncedCount: z.number(),
  complainedCount: z.number(),
  unsubscribedCount: z.number(),
  sentAt: z.string(),
});

const overallStatsSchema = z.object({
  totalSent: z.number(),
  totalDelivered: z.number(),
  totalOpened: z.number(),
  totalClicked: z.number(),
  totalBounced: z.number(),
  totalComplaints: z.number(),
  totalUnsubscribed: z.number(),
  deliveryRate: z.number(),
  openRate: z.number(),
  clickRate: z.number(),
  bounceRate: z.number(),
  complaintRate: z.number(),
  unsubscribeRate: z.number(),
});

type CampaignStats = z.infer<typeof campaignStatsSchema>;
type OverallStats = z.infer<typeof overallStatsSchema>;

interface AnalyticsDashboardProps {
  overallStats: OverallStats;
  campaignStats: CampaignStats[];
  dateRange: '7d' | '30d' | '90d' | 'all';
  onDateRangeChange: (range: '7d' | '30d' | '90d' | 'all') => void;
}

export function AnalyticsDashboard({
  overallStats,
  campaignStats,
  dateRange,
  onDateRangeChange,
}: AnalyticsDashboardProps) {
  const formatPercentage = (value: number) => `${(value * 100).toFixed(1)}%`;
  const formatNumber = (value: number) => value.toLocaleString();

  const getPerformanceColor = (rate: number, thresholds: { good: number; fair: number }) => {
    if (rate >= thresholds.good) return 'text-green-600';
    if (rate >= thresholds.fair) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getRateIcon = (current: number, previous: number) => {
    if (current > previous) return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (current < previous) return <TrendingDown className="h-4 w-4 text-red-600" />;
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Email Analytics</h2>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Select value={dateRange} onValueChange={onDateRangeChange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <Mail className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium">Emails Sent</span>
            </div>
            <div className="text-2xl font-bold mt-2">{formatNumber(overallStats.totalSent)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <Eye className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">Open Rate</span>
            </div>
            <div className={`text-2xl font-bold mt-2 ${getPerformanceColor(overallStats.openRate, { good: 0.25, fair: 0.15 })}`}>
              {formatPercentage(overallStats.openRate)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatNumber(overallStats.totalOpened)} opens
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <MousePointer className="h-4 w-4 text-purple-600" />
              <span className="text-sm font-medium">Click Rate</span>
            </div>
            <div className={`text-2xl font-bold mt-2 ${getPerformanceColor(overallStats.clickRate, { good: 0.03, fair: 0.02 })}`}>
              {formatPercentage(overallStats.clickRate)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatNumber(overallStats.totalClicked)} clicks
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <span className="text-sm font-medium">Bounce Rate</span>
            </div>
            <div className={`text-2xl font-bold mt-2 ${getPerformanceColor(1 - overallStats.bounceRate, { good: 0.95, fair: 0.90 })}`}>
              {formatPercentage(overallStats.bounceRate)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatNumber(overallStats.totalBounced)} bounces
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Delivery Performance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm">Delivery Rate</span>
              <div className="flex items-center gap-2">
                <span className={`font-medium ${getPerformanceColor(overallStats.deliveryRate, { good: 0.95, fair: 0.90 })}`}>
                  {formatPercentage(overallStats.deliveryRate)}
                </span>
                <Badge variant={overallStats.deliveryRate >= 0.95 ? 'default' : 'destructive'}>
                  {overallStats.deliveryRate >= 0.95 ? 'Good' : 'Needs Attention'}
                </Badge>
              </div>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm">Complaint Rate</span>
              <div className="flex items-center gap-2">
                <span className={`font-medium ${getPerformanceColor(1 - overallStats.complaintRate, { good: 0.999, fair: 0.995 })}`}>
                  {formatPercentage(overallStats.complaintRate)}
                </span>
                <Badge variant={overallStats.complaintRate <= 0.001 ? 'default' : 'destructive'}>
                  {overallStats.complaintRate <= 0.001 ? 'Good' : 'High'}
                </Badge>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm">Unsubscribe Rate</span>
              <div className="flex items-center gap-2">
                <span className={`font-medium ${getPerformanceColor(1 - overallStats.unsubscribeRate, { good: 0.98, fair: 0.95 })}`}>
                  {formatPercentage(overallStats.unsubscribeRate)}
                </span>
                <Badge variant={overallStats.unsubscribeRate <= 0.02 ? 'default' : 'secondary'}>
                  {overallStats.unsubscribeRate <= 0.02 ? 'Good' : 'Monitor'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Engagement Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <Eye className="h-6 w-6 text-green-600 mx-auto mb-2" />
                <div className="text-lg font-bold text-green-600">
                  {formatNumber(overallStats.totalOpened)}
                </div>
                <div className="text-xs text-green-700">Total Opens</div>
              </div>
              
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <MousePointer className="h-6 w-6 text-purple-600 mx-auto mb-2" />
                <div className="text-lg font-bold text-purple-600">
                  {formatNumber(overallStats.totalClicked)}
                </div>
                <div className="text-xs text-purple-700">Total Clicks</div>
              </div>
              
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <AlertTriangle className="h-6 w-6 text-red-600 mx-auto mb-2" />
                <div className="text-lg font-bold text-red-600">
                  {formatNumber(overallStats.totalBounced)}
                </div>
                <div className="text-xs text-red-700">Bounces</div>
              </div>
              
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <UserMinus className="h-6 w-6 text-gray-600 mx-auto mb-2" />
                <div className="text-lg font-bold text-gray-600">
                  {formatNumber(overallStats.totalUnsubscribed)}
                </div>
                <div className="text-xs text-gray-700">Unsubscribes</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Campaign Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Delivered</TableHead>
                <TableHead>Opens</TableHead>
                <TableHead>Clicks</TableHead>
                <TableHead>Bounces</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaignStats.map((campaign) => {
                const deliveryRate = campaign.sentCount > 0 ? campaign.deliveredCount / campaign.sentCount : 0;
                const openRate = campaign.deliveredCount > 0 ? campaign.openedCount / campaign.deliveredCount : 0;
                const clickRate = campaign.deliveredCount > 0 ? campaign.clickedCount / campaign.deliveredCount : 0;
                const bounceRate = campaign.sentCount > 0 ? campaign.bouncedCount / campaign.sentCount : 0;

                return (
                  <TableRow key={campaign.campaignId}>
                    <TableCell className="font-medium">{campaign.campaignName}</TableCell>
                    <TableCell>{formatNumber(campaign.sentCount)}</TableCell>
                    <TableCell>
                      <div>
                        {formatNumber(campaign.deliveredCount)}
                        <div className="text-xs text-muted-foreground">
                          {formatPercentage(deliveryRate)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        {formatNumber(campaign.openedCount)}
                        <div className={`text-xs ${getPerformanceColor(openRate, { good: 0.25, fair: 0.15 })}`}>
                          {formatPercentage(openRate)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        {formatNumber(campaign.clickedCount)}
                        <div className={`text-xs ${getPerformanceColor(clickRate, { good: 0.03, fair: 0.02 })}`}>
                          {formatPercentage(clickRate)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        {formatNumber(campaign.bouncedCount)}
                        <div className={`text-xs ${getPerformanceColor(1 - bounceRate, { good: 0.95, fair: 0.90 })}`}>
                          {formatPercentage(bounceRate)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Date(campaign.sentAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {campaignStats.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No campaign data available for the selected period.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}