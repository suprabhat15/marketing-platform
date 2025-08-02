import { z } from 'zod';

export const trackingEventSchema = z.object({
  type: z.enum(['sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed']),
  subscriberId: z.string(),
  campaignId: z.string(),
  listId: z.string(),
  timestamp: z.date(),
  data: z.record(z.any()).optional(),
});

export type TrackingEvent = z.infer<typeof trackingEventSchema>;

export interface TrackingPixelParams {
  campaignId: string;
  subscriberId: string;
  listId: string;
}

export interface TrackingLinkParams extends TrackingPixelParams {
  url: string;
  linkId?: string;
}

export class EmailTracker {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  generateTrackingPixel({ campaignId, subscriberId, listId }: TrackingPixelParams): string {
    const params = new URLSearchParams({
      c: campaignId,
      s: subscriberId,
      l: listId,
      t: Date.now().toString(),
    });

    return `${this.baseUrl}/api/track/open?${params.toString()}`;
  }

  generateTrackingLink({ campaignId, subscriberId, listId, url, linkId }: TrackingLinkParams): string {
    const params = new URLSearchParams({
      c: campaignId,
      s: subscriberId,
      l: listId,
      u: encodeURIComponent(url),
      ...(linkId && { lid: linkId }),
    });

    return `${this.baseUrl}/api/track/click?${params.toString()}`;
  }

  generateUnsubscribeLink({ campaignId, subscriberId, listId }: TrackingPixelParams): string {
    const params = new URLSearchParams({
      c: campaignId,
      s: subscriberId,
      l: listId,
    });

    return `${this.baseUrl}/api/track/unsubscribe?${params.toString()}`;
  }

  injectTrackingIntoHtml(html: string, params: TrackingPixelParams): string {
    let trackedHtml = html;

    // Inject tracking pixel before closing body tag
    const trackingPixel = `<img src="${this.generateTrackingPixel(params)}" width="1" height="1" style="display:none;" alt="" />`;
    
    if (trackedHtml.includes('</body>')) {
      trackedHtml = trackedHtml.replace('</body>', `${trackingPixel}</body>`);
    } else {
      trackedHtml += trackingPixel;
    }

    // Replace links with tracking links
    const linkRegex = /<a\s+([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi;
    trackedHtml = trackedHtml.replace(linkRegex, (match, beforeHref, url, afterHref) => {
      // Skip mailto, tel, and anchor links
      if (url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('#')) {
        return match;
      }

      // Skip if it's already a tracking link
      if (url.includes('/api/track/')) {
        return match;
      }

      const trackingUrl = this.generateTrackingLink({ ...params, url });
      return `<a ${beforeHref}href="${trackingUrl}"${afterHref}>`;
    });

    // Replace unsubscribe placeholders
    const unsubscribeUrl = this.generateUnsubscribeLink(params);
    trackedHtml = trackedHtml.replace(/{{unsubscribeUrl}}/g, unsubscribeUrl);

    return trackedHtml;
  }

  extractTrackingParams(searchParams: URLSearchParams): TrackingPixelParams | null {
    const campaignId = searchParams.get('c');
    const subscriberId = searchParams.get('s');
    const listId = searchParams.get('l');

    if (!campaignId || !subscriberId || !listId) {
      return null;
    }

    return { campaignId, subscriberId, listId };
  }

  async recordEvent(event: Omit<TrackingEvent, 'timestamp'>): Promise<void> {
    try {
      const response = await fetch('/api/tracking/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...event,
          timestamp: new Date(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to record tracking event: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error recording tracking event:', error);
      // In a production environment, you might want to queue events for retry
    }
  }
}

export const createEmailTracker = (baseUrl?: string) => {
  const url = baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return new EmailTracker(url);
};

// Utility functions for analytics
export const calculateEngagementMetrics = (events: TrackingEvent[]) => {
  const eventCounts = events.reduce((acc, event) => {
    acc[event.type] = (acc[event.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const sent = eventCounts.sent || 0;
  const delivered = eventCounts.delivered || 0;
  const opened = eventCounts.opened || 0;
  const clicked = eventCounts.clicked || 0;
  const bounced = eventCounts.bounced || 0;
  const complained = eventCounts.complained || 0;
  const unsubscribed = eventCounts.unsubscribed || 0;

  return {
    totalSent: sent,
    totalDelivered: delivered,
    totalOpened: opened,
    totalClicked: clicked,
    totalBounced: bounced,
    totalComplaints: complained,
    totalUnsubscribed: unsubscribed,
    deliveryRate: sent > 0 ? delivered / sent : 0,
    openRate: delivered > 0 ? opened / delivered : 0,
    clickRate: delivered > 0 ? clicked / delivered : 0,
    bounceRate: sent > 0 ? bounced / sent : 0,
    complaintRate: delivered > 0 ? complained / delivered : 0,
    unsubscribeRate: delivered > 0 ? unsubscribed / delivered : 0,
  };
};

export const getEngagementTrends = (events: TrackingEvent[], days: number = 30) => {
  const now = new Date();
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  
  const dailyEvents = events
    .filter(event => event.timestamp >= startDate)
    .reduce((acc, event) => {
      const dateKey = event.timestamp.toISOString().split('T')[0];
      if (!acc[dateKey]) {
        acc[dateKey] = { sent: 0, opened: 0, clicked: 0, bounced: 0 };
      }
      if (event.type in acc[dateKey]) {
        acc[dateKey][event.type as keyof typeof acc[dateKey]]++;
      }
      return acc;
    }, {} as Record<string, Record<string, number>>);

  return Object.entries(dailyEvents)
    .map(([date, metrics]) => ({
      date,
      ...metrics,
      openRate: metrics.sent > 0 ? (metrics.opened / metrics.sent) * 100 : 0,
      clickRate: metrics.sent > 0 ? (metrics.clicked / metrics.sent) * 100 : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
};