// Ultra-lightweight subscriber API
import { NextRequest, NextResponse } from "next/server";
import { createErrorResponse, createSuccessResponse, getPaginationParams } from '@/lib/api-utils';
import { findMany } from '@/lib/db-lite';
import { requireAuth } from '@/lib/auth-lite';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    await requireAuth(request);
    const { listId } = await params;
    const { page, limit, skip } = getPaginationParams(request);

    const [subscribers, total] = await Promise.all([
      findMany('subscriber', {
        where: { listId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      findMany('subscriber', {
        where: { listId },
        select: { id: true },
      }).then((result: any[]) => result.length)
    ]);

    return createSuccessResponse({
      subscribers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to fetch subscribers',
      error instanceof Error && error.message === 'Unauthorized' ? 401 : 500
    );
  }
}