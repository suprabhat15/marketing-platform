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
        
        // Use transaction to ensure consistency
        const result = await prisma.$transaction(async (tx) => {
          // Update subscriber status
          await tx.subscriber.updateMany({
            where: { email },
            data: { status: 'COMPLAINED' },
          });

          // Log complaint event
          const newEvent = await tx.event.create({
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

          return newEvent;
        });

        // Only broadcast after successful database commit
        try {
          const { broadcastEvent } = await import('@/lib/event-broadcast');
          // Note: We don't have campaignId in complaint webhook, so we skip broadcast
          // or you could extract it from headers/tags if available
          console.log(`✅ Complaint event processed for ${email}`);
        } catch (broadcastError) {
          console.error('❌ Error broadcasting complaint event (DB operation succeeded):', broadcastError);
        }
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