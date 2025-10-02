import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sesClient } from "@/lib/ses";

// Lazy import getUserDomains to reduce initial bundle
async function getUserDomains(userId: string) {
  return await prisma.domain.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

// Lazy import SES only when needed for deletion
async function createSESClient() {
  const { DeleteIdentityCommand } = await import('@aws-sdk/client-ses');
  
  return DeleteIdentityCommand;
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const domains = await getUserDomains(session.user.id);

    return NextResponse.json({ domains });

  } catch (error) {
    console.error('Error fetching user domains:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const domainId = searchParams.get('id');

    if (!domainId) {
      return NextResponse.json({ error: 'Domain ID required' }, { status: 400 });
    }

    // First, get the domain to extract domain name for SES deletion
    const domainRecord = await prisma.domain.findFirst({
      where: {
        id: domainId,
        userId: session.user.id,
      },
    });

    if (!domainRecord) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
    }

    try {
      // Delete from AWS SES first - lazy load SES client
      const DeleteIdentityCommand = await createSESClient();
      await sesClient.send(new DeleteIdentityCommand({
        Identity: domainRecord.domain,
      }));
    } catch (sesError) {
      console.error('Error deleting domain from SES:', sesError);
      // Continue with database deletion even if SES deletion fails
      // This prevents orphaned records in the database
    }

    // Delete from database
    const deletedDomain = await prisma.domain.deleteMany({
      where: {
        id: domainId,
        userId: session.user.id,
      },
    });

    if (deletedDomain.count === 0) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Domain unlinked successfully' });

  } catch (error) {
    console.error('Error deleting domain:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}