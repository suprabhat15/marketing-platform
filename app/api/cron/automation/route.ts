import { NextRequest, NextResponse } from 'next/server';
import { EmailScheduler } from '@/lib/scheduler';

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await EmailScheduler.processAutomationRules();
    
    return NextResponse.json({ 
      success: true, 
      message: 'Automation rules processed' 
    });
  } catch (error) {
    console.error('Automation cron job error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}