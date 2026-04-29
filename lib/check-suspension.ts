import { NextResponse } from 'next/server';
import { redis } from './redis';
import { prisma } from './prisma';

export async function checkSuspension(
  userId: string
): Promise<NextResponse | null> {
  const cacheKey = `user:suspended:${userId}`;
  const cached = await redis.get(cacheKey);

  if (cached === 'true') {
    const reason = await redis.get(`user:suspended_reason:${userId}`);
    return NextResponse.json(
      {
        error: 'Account suspended',
        reason: reason || 'Your account has been suspended',
      },
      { status: 403 }
    );
  }

  if (cached === 'false') {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { suspended: true, suspendedReason: true },
  });

  if (user?.suspended) {
    await Promise.all([
      redis.set(cacheKey, 'true', 'EX', 300),
      redis.set(
        `user:suspended_reason:${userId}`,
        user.suspendedReason || '',
        'EX',
        300
      ),
    ]);
    return NextResponse.json(
      {
        error: 'Account suspended',
        reason: user.suspendedReason,
      },
      { status: 403 }
    );
  }

  await redis.set(cacheKey, 'false', 'EX', 60);
  return null;
}
