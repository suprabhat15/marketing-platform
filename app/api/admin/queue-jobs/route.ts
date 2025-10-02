import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { campaignQueue, batchQueue, dlqQueue, batchDlqQueue } from '@/lib/queue';

// Admin emails that can access this endpoint
const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(',') || [
  'subratzx007@gmail.com',
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

export async function GET(request: NextRequest) {
  const isAdmin = await checkAdminAccess(request);
  
  if (!isAdmin) {
    return NextResponse.json(
      { error: 'Unauthorized. Admin access required.' },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const queueType = searchParams.get('queue') || 'all';
    const status = searchParams.get('status') || 'all';
    const limit = parseInt(searchParams.get('limit') || '20');

    let jobs: any[] = [];

    if (queueType === 'all' || queueType === 'campaign') {
      const campaignJobs = await campaignQueue.getJobs(['waiting', 'active', 'completed', 'failed'], 0, limit - 1);
      jobs.push(...campaignJobs.map(job => ({
        id: job.id,
        name: job.name,
        queue: 'campaign',
        status: job.finishedOn ? (job.failedReason ? 'failed' : 'completed') : (job.processedOn ? 'active' : 'waiting'),
        data: job.data,
        progress: job.progress,
        createdAt: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
      })));
    }

    if (queueType === 'all' || queueType === 'batch') {
      const batchJobs = await batchQueue.getJobs(['waiting', 'active', 'completed', 'failed'], 0, limit - 1);
      jobs.push(...batchJobs.map(job => ({
        id: job.id,
        name: job.name,
        queue: 'batch',
        status: job.finishedOn ? (job.failedReason ? 'failed' : 'completed') : (job.processedOn ? 'active' : 'waiting'),
        data: job.data,
        progress: job.progress,
        createdAt: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
      })));
    }

    if (queueType === 'all' || queueType === 'dlq') {
      const dlqJobs = await dlqQueue.getJobs(['waiting', 'active', 'completed', 'failed'], 0, limit - 1);
      jobs.push(...dlqJobs.map(job => ({
        id: job.id,
        name: job.name,
        queue: 'dlq',
        status: job.finishedOn ? (job.failedReason ? 'failed' : 'completed') : (job.processedOn ? 'active' : 'waiting'),
        data: job.data,
        progress: job.progress,
        createdAt: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
      })));
    }

    if (queueType === 'all' || queueType === 'batch-dlq') {
      const batchDlqJobs = await batchDlqQueue.getJobs(['waiting', 'active', 'completed', 'failed'], 0, limit - 1);
      jobs.push(...batchDlqJobs.map(job => ({
        id: job.id,
        name: job.name,
        queue: 'batch-dlq',
        status: job.finishedOn ? (job.failedReason ? 'failed' : 'completed') : (job.processedOn ? 'active' : 'waiting'),
        data: job.data,
        progress: job.progress,
        createdAt: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
      })));
    }

    // Filter by status if specified
    if (status !== 'all') {
      jobs = jobs.filter(job => job.status === status);
    }

    // Sort by creation time (newest first)
    jobs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    // Limit results
    jobs = jobs.slice(0, limit);

    return NextResponse.json({ jobs });
  } catch (error) {
    console.error('Error fetching queue jobs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch queue jobs' },
      { status: 500 }
    );
  }
}