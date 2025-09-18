import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getQueueStats } from '@/lib/queue';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Get queue statistics
    const stats = await getQueueStats();

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      queues: {
        campaign: {
          name: 'Campaign Processing',
          description: 'Processes campaign send requests and splits them into batches',
          ...(stats.campaign ?? {})
        },
        batch: {
          name: 'Batch Processing', 
          description: 'Processes batches of subscribers and streams email sends with rate limiting',
          ...(stats.batch ?? {})
        }
      },
      totals: {
        waiting: (stats.campaign.waiting || 0) + (stats.batch.waiting || 0),
        active: (stats.campaign.active || 0) + (stats.batch.active || 0),
        completed: (stats.campaign.completed || 0) + (stats.batch.completed || 0),
        failed: (stats.campaign.failed || 0) + (stats.batch.failed || 0),
      }
    }, { headers: { 'Cache-Control': 'no-store' } });

  } catch (error) {
    console.error('Error getting queue stats:', error);
    return NextResponse.json(
      { error: 'Failed to get queue statistics' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}