import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getQueueStats } from '@/lib/queue';

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

export async function GET(request: NextRequest) {
  const isAdmin = await checkAdminAccess(request);
  
  if (!isAdmin) {
    return NextResponse.json(
      { error: 'Unauthorized. Admin access required.' },
      { status: 403 }
    );
  }

  try {
    const stats = await getQueueStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error fetching queue stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch queue statistics' },
      { status: 500 }
    );
  }
}