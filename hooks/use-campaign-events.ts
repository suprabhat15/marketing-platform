'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { globalSSEManager } from '@/lib/global-sse-manager';

interface CampaignEvent {
  id: string;
  type: 'SENT' | 'DELIVERED' | 'OPENED' | 'CLICKED' | 'BOUNCED' | 'COMPLAINED' | 'UNSUBSCRIBED';
  campaignId: string;
  subscriber: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  data: any;
  createdAt: string;
}

interface CampaignStats {
  campaign: {
    id: string;
    name: string;
    status: string;
    sentAt: string | null;
    createdAt: string;
  };
  eventsByType: Record<string, number>;
  totalEvents: number;
}

interface UseCampaignEventsOptions {
  enabled?: boolean;
  onEvent?: (event: CampaignEvent) => void;
  onStatsUpdate?: (stats: CampaignStats) => void;
  onError?: (error: Error) => void;
  onConnectionChange?: (connected: boolean) => void;
}

export function useCampaignEvents(campaignId: string, userId: string, options: UseCampaignEventsOptions = {}) {
  const {
    enabled = true,
    onEvent,
    onStatsUpdate,
    onError,
    onConnectionChange
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [lastEventId, setLastEventId] = useState<string>('0');
  const [connectionError, setConnectionError] = useState<Error | null>(null);
  const [stats, setStats] = useState<CampaignStats | null>(null);

  const unsubscribeRef = useRef<(() => void) | null>(null);
  
  // Use refs to avoid stale closures
  const callbacksRef = useRef({
    onEvent,
    onStatsUpdate,
    onError,
    onConnectionChange
  });
  
  // Update refs when callbacks change
  useEffect(() => {
    callbacksRef.current = {
      onEvent,
      onStatsUpdate,
      onError,
      onConnectionChange
    };
  }, [onEvent, onStatsUpdate, onError, onConnectionChange]);

  // Use global SSE manager to prevent duplicates
  useEffect(() => {
    console.log(`🔄 useEffect triggered for campaign: ${campaignId}, userId: ${userId}, enabled: ${enabled}`);
    
    if (!enabled || !campaignId || !userId) {
      console.log(`❌ Skipping SSE subscription: enabled=${enabled}, campaignId=${campaignId}, userId=${userId}`);
      return;
    }

    console.log(`🔗 Subscribing to global SSE for campaign: ${campaignId}, userId: ${userId}`);
    setIsConnected(true);
    setConnectionError(null);
    callbacksRef.current.onConnectionChange?.(true);

    const unsubscribe = globalSSEManager.subscribe(campaignId, userId, (data) => {
      try {
        // Handle different event types
        if (data.type === 'connected') {
          console.log('✅ Global SSE connected:', data);
        } else if (data.type === 'event' && data.data) {
          const eventData: CampaignEvent = data.data;
          setLastEventId(eventData.id);
          callbacksRef.current.onEvent?.(eventData);
        } else if (data.type === 'campaign-stats') {
          const statsData: CampaignStats = data.data;
          setStats(statsData);
          callbacksRef.current.onStatsUpdate?.(statsData);
        } else if (data.type === 'campaign_status_update') {
          // Handle campaign status updates as stats
          const campaignData = data.data || data;
          if (campaignData.campaignId === campaignId) {
            const mockStats: CampaignStats = {
              campaign: {
                id: campaignId,
                name: '',
                status: campaignData.status,
                sentAt: campaignData.sentAt,
                createdAt: ''
              },
              eventsByType: {},
              totalEvents: 0
            };
            setStats(mockStats);
            callbacksRef.current.onStatsUpdate?.(mockStats);
          }
        } else if (data.type === 'heartbeat') {
          // Just acknowledge heartbeat
        }
      } catch (error) {
        console.error('❌ Error processing global SSE data:', error);
        const errorObj = new Error('SSE data processing failed');
        setConnectionError(errorObj);
        callbacksRef.current.onError?.(errorObj);
      }
    });

    unsubscribeRef.current = unsubscribe;

    return () => {
      console.log(`🔗 Unsubscribing from global SSE for campaign: ${campaignId}, userId: ${userId}`);
      unsubscribe();
      setIsConnected(false);
      callbacksRef.current.onConnectionChange?.(false);
    };
  }, [campaignId, userId, enabled]); // Remove function deps to prevent constant re-renders

  const disconnect = useCallback(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    setIsConnected(false);
    callbacksRef.current.onConnectionChange?.(false);
  }, []); // No dependencies needed since we use refs

  const reconnect = useCallback(() => {
    // Global SSE manager handles reconnection automatically
    console.log('🔄 Reconnect requested (handled by global SSE manager)');
  }, []);

  return {
    isConnected,
    connectionError,
    lastEventId,
    stats,
    reconnect,
    disconnect,
    reconnectAttempts: 0 // Global SSE manager handles reconnection
  };
}