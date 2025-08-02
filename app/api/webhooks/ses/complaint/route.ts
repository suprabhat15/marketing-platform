import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const complaintMessageSchema = z.object({
  notificationType: z.literal('Complaint'),
  complaint: z.object({
    complainedRecipients: z.array(
      z.object({
        emailAddress: z.string().email(),
      })
    ),
    timestamp: z.string(),
    feedbackId: z.string(),
    complaintFeedbackType: z.string().optional(),
  }),
  mail: z.object({
    messageId: z.string(),
    timestamp: z.string(),
    source: z.string(),
    destination: z.array(z.string()),
  }),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { Type, Message } = z.object({
      Type: z.string(),
      Message: z.string(),
    }).parse(body);

    if (Type === 'Notification') {
      const complaintData = complaintMessageSchema.parse(JSON.parse(Message));
      
      // Process complained recipients
      for (const recipient of complaintData.complaint.complainedRecipients) {
        const email = recipient.emailAddress;
        
        // Update subscriber status
        await prisma.subscriber.updateMany({
          where: { email },
          data: { status: 'COMPLAINED' },
        });

        // Log complaint event
        await prisma.event.create({
          data: {
            type: 'COMPLAINED',
            data: {
              email,
              feedbackId: complaintData.complaint.feedbackId,
              complaintFeedbackType: complaintData.complaint.complaintFeedbackType,
              messageId: complaintData.mail.messageId,
            },
          },
        });
      }
    }

    return NextResponse.json({ message: 'Processed successfully' });
  } catch (error) {
    console.error('Error processing complaint webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}