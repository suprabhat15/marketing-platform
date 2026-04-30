import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { importSubscribersSchema } from '@/lib/validators';
import { ZodError } from 'zod';
import { invalidateUserCache } from '@/lib/redis-cache';
import { checkSuspension } from '@/lib/check-suspension';

// POST /api/lists/[listId]/subscribers/import - Import subscribers from CSV
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const suspensionResponse = await checkSuspension(session.user.id);
    if (suspensionResponse) return suspensionResponse;

    const { listId } = await params;
    const body = await request.json();
    const { subscribers } = importSubscribersSchema.parse(body);

    // Check if list exists
    const list = await prisma.list.findUnique({
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

      // Invalidate lists cache so dashboard shows updated count
      if (list.userId) {
        await invalidateUserCache(list.userId, 'lists');
      }
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
    if (error instanceof ZodError) {
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