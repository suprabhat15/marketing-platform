import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

// GET /api/lists/[listId]/subscribers/export - Export subscribers as CSV
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    // Authentication check
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { listId } = await params;

    // Verify user owns the list
    const list = await prisma.list.findFirst({
      where: {
        id: listId,
        userId: session.user.id,
      },
    });

    if (!list) {
      return NextResponse.json(
        { error: 'List not found' },
        { status: 404 }
      );
    }

    // Get all subscribers for the list
    const subscribers = await prisma.subscriber.findMany({
      where: { listId },
      orderBy: { createdAt: 'desc' },
    });

    // Generate CSV content
    const csvHeader = 'Email,First Name,Last Name,Status,Joined Date\n';
    const csvRows = subscribers.map(subscriber => {
      const joinedDate = new Date(subscriber.createdAt).toLocaleDateString();
      return `"${subscriber.email}","${subscriber.firstName || ''}","${subscriber.lastName || ''}","${subscriber.status}","${joinedDate}"`;
    }).join('\n');

    const csvContent = csvHeader + csvRows;

    // Return CSV file
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${list.name}-subscribers.csv"`,
      },
    });
  } catch (error) {
    console.error('Error exporting subscribers:', error);
    return NextResponse.json(
      { error: 'Failed to export subscribers' },
      { status: 500 }
    );
  }
}