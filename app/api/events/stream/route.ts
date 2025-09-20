import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sseManager } from '@/lib/sse-manager';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get('campaignId');
  const userId = searchParams.get('userId');
  const lastEventId = searchParams.get('lastEventId');

  console.log(`🔌 SSE endpoint called with:`, {
    campaignId,
    userId,
    lastEventId,
    url: request.url
  });

  if (!campaignId || !userId) {
    console.log(`❌ SSE endpoint: Missing parameters`);
    return new Response('Missing parameters', { status: 400 });
  }

  // Verify user has access to this campaign
  console.log(`🔍 SSE endpoint: Verifying campaign access for user ${userId}`);
  const campaign = await prisma.campaign.findFirst({
    where: {
      id: campaignId,
      userId: userId,
    },
  });

  if (!campaign) {
    console.log(`❌ SSE endpoint: Unauthorized access attempt for campaign ${campaignId}, user ${userId}`);
    return new Response('Unauthorized', { status: 401 });
  }

  console.log(`✅ SSE endpoint: Campaign access verified, creating connection`);
  // Use the SSE manager to create the connection
  return sseManager.createConnection(campaignId, lastEventId || undefined);
}