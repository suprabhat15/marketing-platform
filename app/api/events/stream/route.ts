import { NextRequest } from 'next/server';

// Lazy load heavy dependencies
async function getSseManager() {
  const { sseManager } = await import('@/lib/sse-manager');
  return sseManager;
}

async function getPrisma() {
  const { prisma } = await import('@/lib/prisma');
  return prisma;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get('campaignId');
  const userId = searchParams.get('userId');
  const lastEventId = searchParams.get('lastEventId');

  // console.log(`🔌 SSE endpoint called with:`, {
  //   campaignId,
  //   userId,
  //   lastEventId,
  //   url: request.url
  // });

  if (!campaignId || !userId) {
    // console.log(`❌ SSE endpoint: Missing parameters`);
    return new Response('Missing parameters', { status: 400 });
  }

  // Verify user has access to this campaign
  const prisma = await getPrisma();
  const campaign = await prisma.campaign.findFirst({
    where: {
      id: campaignId,
      userId: userId,
    },
  });

  if (!campaign) {
    return new Response('Unauthorized', { status: 401 });
  }

  console.log(`✅ SSE endpoint: Campaign access verified, creating connection`);
  // Use the SSE manager to create the connection
  const sseManager = await getSseManager();
  return sseManager.createConnection(campaignId, lastEventId || undefined);
}