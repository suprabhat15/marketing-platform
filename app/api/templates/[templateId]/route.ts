import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const templateUpdateSchema = z.object({
  name: z.string().min(1, 'Template name is required'),
  subject: z.string().min(1, 'Subject is required'),
  content: z.string().min(1, 'Content is required'),
  attachments: z.array(z.object({
    name: z.string(),
    size: z.number(),
    type: z.string(),
    url: z.string(),
  })).optional(),
});

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  try {
    const { templateId } = await params;
    
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if template exists
    const existingTemplate = await prisma.template.findUnique({
      where: { id: templateId }
    });

    if (!existingTemplate) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    await prisma.template.delete({
      where: {
        id: templateId,
        userId: session?.user.id,
      },
    });

    return NextResponse.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Error deleting template:', error);
    return NextResponse.json(
      { error: 'Failed to delete template' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  try {
    const { templateId } = await params;
    
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    const template = await prisma.template.findFirst({
      where: {
        id: templateId,
        userId: session?.user.id,
      },
    });

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json({ template });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  try {
    const { templateId } = await params;
    const body = await request.json();
    
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    // Validate the request body
    const validatedData = templateUpdateSchema.parse(body);

    // Check if template exists and belongs to user
    const existingTemplate = await prisma.template.findFirst({
      where: {
        id: templateId,
        userId: session?.user.id,
      },
    });

    if (!existingTemplate) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const updatedTemplate = await prisma.template.update({
      where: {
        id: templateId,
      },
      data: {
        name: validatedData.name,
        subject: validatedData.subject,
        content: validatedData.content,
        attachments: validatedData.attachments || [],
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ 
      message: 'Template updated successfully',
      template: updatedTemplate 
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}