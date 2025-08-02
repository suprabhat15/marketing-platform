import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const snsMessageSchema = z.object({
  Type: z.string(),
  Message: z.string(),
  Subject: z.string().optional(),
});

const bounceMessageSchema = z.object({
  notificationType: z.literal('Bounce'),
  bounce: z.object({
    bounceType: z.string(),
    bounceSubType: z.string(),
    bouncedRecipients: z.array(
      z.object({
        emailAddress: z.string().email(),
        action: z.string().optional(),
        status: z.string().optional(),
        diagnosticCode: z.string().optional(),
      })
    ),
    timestamp: z.string(),
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
    const { Type, Message } = snsMessageSchema.parse(body);

    if (Type === 'SubscriptionConfirmation') {
      // Handle SNS subscription confirmation if needed
      return NextResponse.json({ message: 'Subscription confirmed' });
    }

    if (Type === 'Notification') {
      const bounceData = bounceMessageSchema.parse(JSON.parse(Message));
      
      // Process bounced recipients
      for (const recipient of bounceData.bounce.bouncedRecipients) {
        const email = recipient.emailAddress;
        
        // Update subscriber status
        await prisma.subscriber.updateMany({
          where: { email },
          data: { status: 'BOUNCED' },
        });

        // Log bounce event
        await prisma.event.create({
          data: {
            type: 'BOUNCED',
            data: {
              email,
              bounceType: bounceData.bounce.bounceType,
              bounceSubType: bounceData.bounce.bounceSubType,
              diagnosticCode: recipient.diagnosticCode,
              messageId: bounceData.mail.messageId,
            },
          },
        });
      }
    }

    return NextResponse.json({ message: 'Processed successfully' });
  } catch (error) {
    console.error('Error processing bounce webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}