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

    const sanitizeCsvCell = (value: string) => {
      let sanitized = value.replace(/"/g, '""');
      sanitized = sanitized.replace(/[\r\n]+/g, ' ');
      if (/^[=+\-@\t]/.test(sanitized)) {
        sanitized = "'" + sanitized;
      }
      return sanitized;
    };

    const csvHeader = 'Email,First Name,Last Name,Status,Joined Date\n';
    const csvRows = subscribers.map(subscriber => {
      const joinedDate = new Date(subscriber.createdAt).toLocaleDateString();
      const email = sanitizeCsvCell(subscriber.email);
      const firstName = sanitizeCsvCell(subscriber.firstName || '');
      const lastName = sanitizeCsvCell(subscriber.lastName || '');
      const status = sanitizeCsvCell(subscriber.status);
      return `"${email}","${firstName}","${lastName}","${status}","${joinedDate}"`;
    }).join('\n');

    const csvContent = csvHeader + csvRows;

    const safeFilename = list.name.replace(/[^a-zA-Z0-9_\-. ]/g, '_');

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${safeFilename}-subscribers.csv"`,
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