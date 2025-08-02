import { NextRequest, NextResponse } from 'next/server';
import { EmailScheduler } from '@/lib/scheduler';

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await EmailScheduler.processScheduledCampaigns();
    
    return NextResponse.json({ 
      success: true, 
      message: 'Scheduled campaigns processed' 
    });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}