import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getUserDomains } from '@/lib/domain-verification';
import { prisma } from '@/lib/prisma';
import { SESClient, DeleteIdentityCommand } from '@aws-sdk/client-ses';

const ses = new SESClient({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

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
      // Delete from AWS SES first
      await ses.send(new DeleteIdentityCommand({
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