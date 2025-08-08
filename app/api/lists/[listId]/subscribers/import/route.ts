import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const importSubscribersSchema = z.object({
  subscribers: z.array(z.object({
    email: z.string().email('Invalid email address'),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    status: z.enum(['ACTIVE', 'UNSUBSCRIBED']).optional(),
  })),
});

// POST /api/lists/[listId]/subscribers/import - Import subscribers from CSV
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { listId } = await params;
    const body = await request.json();
    const { subscribers } = importSubscribersSchema.parse(body);

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

    // Normalize and deduplicate emails from CSV first
    const emailMap = new Map<string, any>();
    let csvDuplicates = 0;
    
    // Remove duplicates within the CSV file itself (case-insensitive)
    subscribers.forEach(subscriber => {
      const normalizedEmail = subscriber.email.toLowerCase().trim();
      if (emailMap.has(normalizedEmail)) {
        csvDuplicates++;
      } else {
        emailMap.set(normalizedEmail, {
          ...subscriber,
          email: normalizedEmail // Store normalized email
        });
      }
    });

    const uniqueSubscribers = Array.from(emailMap.values());

    // Get existing subscribers to handle duplicates with database
    const existingSubscribers = await prisma.subscriber.findMany({
      where: { 
        listId,
        email: {
          in: uniqueSubscribers.map(s => s.email)
        }
      },
      select: { email: true },
    });

    const existingEmails = new Set(existingSubscribers.map(s => s.email.toLowerCase()));
    
    // Separate new and existing subscribers
    const newSubscribers = uniqueSubscribers.filter(s => !existingEmails.has(s.email));
    const dbDuplicateCount = uniqueSubscribers.length - newSubscribers.length;

    let importedCount = 0;

    if (newSubscribers.length > 0) {
      // Create new subscribers
      const result = await prisma.subscriber.createMany({
        data: newSubscribers.map(subscriber => ({
          email: subscriber.email,
          firstName: subscriber.firstName || '',
          lastName: subscriber.lastName || '',
          status: subscriber.status === 'UNSUBSCRIBED' ? 'UNSUBSCRIBED' : 'ACTIVE',
          listId,
        })),
      });
      importedCount = result.count;
    }

    return NextResponse.json({
      success: true,
      message: 'Import completed successfully',
      stats: {
        total: subscribers.length,
        imported: importedCount,
        duplicates: dbDuplicateCount + csvDuplicates,
        csvDuplicates,
        dbDuplicates: dbDuplicateCount,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error importing subscribers:', error);
    return NextResponse.json(
      { error: 'Failed to import subscribers' },
      { status: 500 }
    );
  }
}