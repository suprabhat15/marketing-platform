import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { retryFailedBatches } from '@/lib/queue';

// Admin emails that can access this endpoint
const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(',') || [
  'subratzx007@gmail.com'
];

async function checkAdminAccess(request: NextRequest): Promise<boolean> {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user?.email) {
      return false;
    }

    return ADMIN_EMAILS.includes(session.user.email);
  } catch (error) {
    console.error('Error checking admin access:', error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  const isAdmin = await checkAdminAccess(request);
  
  if (!isAdmin) {
    return NextResponse.json(
      { error: 'Unauthorized. Admin access required.' },
      { status: 403 }
    );
  }

  try {
    const { queueType, campaignId, limit } = await request.json();

    if (queueType === 'campaign' || queueType === 'batch') {
      const retriedCount = await retryFailedBatches(campaignId, limit || 50);
      
      return NextResponse.json({
        success: true,
        retriedCount,
        message: `Retried ${retriedCount} failed ${queueType} jobs${campaignId ? ` for campaign ${campaignId}` : ''}`
      });
    }

    return NextResponse.json(
      { error: 'Invalid queue type. Must be "campaign" or "batch".' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error retrying failed jobs:', error);
    return NextResponse.json(
      { error: 'Failed to retry jobs' },
      { status: 500 }
    );
  }
}