import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sseManager } from '@/lib/sse-manager';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get('campaignId');
  const userId = searchParams.get('userId');
  const lastEventId = searchParams.get('lastEventId');

  if (!campaignId || !userId) {
    return new Response('Missing parameters', { status: 400 });
  }

  // Verify user has access to this campaign
  const campaign = await prisma.campaign.findFirst({
    where: {
      id: campaignId,
      userId: userId,
    },
  });

  if (!campaign) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Use the SSE manager to create the connection
  return sseManager.createConnection(campaignId, lastEventId || undefined);
}