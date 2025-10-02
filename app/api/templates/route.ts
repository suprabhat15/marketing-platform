import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createTemplateSchema } from "@/lib/validators";
import { ZodError } from 'zod';

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    const templates = await prisma.template.findMany({
      where: { userId: session?.user.id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ templates });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, subject, content, attachments } = createTemplateSchema.parse(body);

    const template = await prisma.template.create({
      data: {
        name,
        subject,
        content,
        attachments: attachments || [],
        userId: session?.user.id,
      },
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}