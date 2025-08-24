import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getWorkerStatus } from '@/lib/on-demand-queue-worker';

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get worker status
    const status = await getWorkerStatus();

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      worker: status,
      mode: 'on-demand',
      description: 'Worker starts automatically when campaigns are queued and stops when idle'
    });

  } catch (error) {
    console.error('Error getting worker status:', error);
    return NextResponse.json(
      { error: 'Failed to get worker status' },
      { status: 500 }
    );
  }
}