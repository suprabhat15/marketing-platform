'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, UsersIcon, Loader2, Activity } from 'lucide-react';
import { format } from 'date-fns';

interface Event {
  id: string;
  type:
    | 'SENT'
    | 'DELIVERED'
    | 'OPENED'
    | 'CLICKED'
    | 'BOUNCED'
    | 'COMPLAINED'
    | 'UNSUBSCRIBED';
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
  status: 'DRAFT' | 'SCHEDULED' | 'QUEUED' | 'SENDING' | 'SENT' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
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

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params?.campaignId as string;
  const [campaign, setCampaign] = useState<Campaign | null>(null);

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

  // Initial load effect
  useEffect(() => {
    if (!campaignId) return;
    fetchCampaign();
  }, [campaignId, fetchCampaign]);

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
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <UsersIcon className="h-8 w-8 text-green-600" />
                  <div>
                    <div className="text-2xl font-bold">
                      {campaign.subscriberCount.toLocaleString()}
                    </div>
                    <p className="text-muted-foreground text-xs">Recipients</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Activity className="h-8 w-8 text-blue-600" />
                  <div>
                    <div className="text-2xl font-bold">
                      {campaign.totalEvents.toLocaleString()}
                    </div>
                    <p className="text-muted-foreground text-xs">
                      Total Events
                    </p>
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
                    <div className="text-2xl font-bold">
                      {count.toLocaleString()}
                    </div>
                    <Badge
                      className={getEventStatusColor(type as Event['type'])}
                      variant="secondary"
                    >
                      {type}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}