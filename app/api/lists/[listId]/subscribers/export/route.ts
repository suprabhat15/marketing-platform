import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/lists/[listId]/subscribers/export - Export subscribers as CSV
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { listId } = await params;

    // Check if list exists
    const list = await prisma.list.findUnique({
      where: { id: listId },
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