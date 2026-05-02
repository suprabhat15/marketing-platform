import { NextRequest } from 'next/server';

async function getAuth() {
  const { auth } = await import('@/lib/auth');
  return auth;
}

async function getSseManager() {
  const { sseManager } = await import('@/lib/sse-manager');
  return sseManager;
}

async function getPrisma() {
  const { prisma } = await import('@/lib/prisma');
  return prisma;
}

export async function GET(request: NextRequest) {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session || !session.user || !session.user.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get('campaignId');
  const lastEventId = searchParams.get('lastEventId');

  if (!campaignId) {
    return new Response('Missing campaignId', { status: 400 });
  }

  const prisma = await getPrisma();
  const campaign = await prisma.campaign.findFirst({
    where: {
      id: campaignId,
      userId: session.user.id,
    },
  });

  if (!campaign) {
    return new Response('Campaign not found', { status: 404 });
  }

  console.log(`✅ SSE endpoint: Campaign access verified, creating connection`);
  // Use the SSE manager to create the connection
  const sseManager = await getSseManager();
  return sseManager.createConnection(campaignId, lastEventId || undefined);
}