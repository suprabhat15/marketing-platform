import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sseManager } from '@/lib/sse-manager';
import { eventBroadcaster } from '@/lib/event-broadcaster';

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get SSE and broadcaster statistics
    const sseStats = sseManager.getStats();
    const broadcasterStats = eventBroadcaster.getStats();

    const stats = {
      timestamp: new Date().toISOString(),
      sse: sseStats,
      broadcaster: broadcasterStats,
      summary: {
        totalConnections: sseStats.totalConnections,
        activeCampaigns: sseStats.totalCampaigns,
        queuedEvents: broadcasterStats.queueSize,
        isProcessing: broadcasterStats.isProcessing
      }
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error fetching SSE stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}