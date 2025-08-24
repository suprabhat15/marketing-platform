import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getQueueStats } from '@/lib/queue';

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get queue statistics
    const stats = await getQueueStats();

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      queues: {
        campaign: {
          name: 'Campaign Processing',
          description: 'Processes campaign send requests and splits them into batches',
          ...stats.campaign
        },
        batch: {
          name: 'Batch Processing', 
          description: 'Processes batches of subscribers and queues individual emails',
          ...stats.batch
        },
        email: {
          name: 'Email Sending',
          description: 'Sends individual emails via AWS SES',
          ...stats.email
        }
      },
      totals: {
        waiting: (stats.campaign.waiting || 0) + (stats.batch.waiting || 0) + (stats.email.waiting || 0),
        active: (stats.campaign.active || 0) + (stats.batch.active || 0) + (stats.email.active || 0),
        completed: (stats.campaign.completed || 0) + (stats.batch.completed || 0) + (stats.email.completed || 0),
        failed: (stats.campaign.failed || 0) + (stats.batch.failed || 0) + (stats.email.failed || 0),
      }
    });

  } catch (error) {
    console.error('Error getting queue stats:', error);
    return NextResponse.json(
      { error: 'Failed to get queue statistics' },
      { status: 500 }
    );
  }
}