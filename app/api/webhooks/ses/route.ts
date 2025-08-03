import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

interface SESEventRecord {
  eventType: string;
  mail: {
    messageId: string;
    source: string;
    timestamp: string;
    destination: string[];
    headers?: Array<{ name: string; value: string }>;
    commonHeaders?: {
      subject?: string;
      from?: string[];
      to?: string[];
    };
    tags?: Record<string, string[]>;
  };
  bounce?: {
    bounceType: string;
    bounceSubType: string;
    bouncedRecipients: Array<{
      emailAddress: string;
      action?: string;
      status?: string;
      diagnosticCode?: string;
    }>;
  };
  complaint?: {
    complainedRecipients: Array<{
      emailAddress: string;
    }>;
    complaintFeedbackType?: string;
  };
  delivery?: {
    timestamp: string;
    processingTimeMillis: number;
    recipients: string[];
  };
  send?: {
    timestamp: string;
  };
  click?: {
    link: string;
    linkTags?: Record<string, string>;
    timestamp: string;
  };
  open?: {
    timestamp: string;
    userAgent?: string;
    ipAddress?: string;
  };
  reject?: {
    reason: string;
  };
  renderingFailure?: {
    errorMessage: string;
    templateName?: string;
  };
}

interface SNSMessage {
  Type: string;
  MessageId: string;
  TopicArn: string;
  Subject?: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  SubscribeURL?: string;
  Token?: string;
}

// Map SES event types to our database enum
const mapEventType = (sesEventType: string): string => {
  const mapping: Record<string, string> = {
    'send': 'SENT',
    'delivery': 'DELIVERED',
    'open': 'OPENED',
    'click': 'CLICKED',
    'bounce': 'BOUNCED',
    'complaint': 'COMPLAINED',
    'reject': 'BOUNCED', // Treat rejects as bounces
    'renderingFailure': 'BOUNCED', // Treat rendering failures as bounces
  };
  
  return mapping[sesEventType] || sesEventType.toUpperCase();
};

// Verify SNS signature (optional but recommended for production)
async function verifySNSSignature(headers: Headers, body: string): Promise<boolean> {
  try {
    // In production, you should implement proper SNS signature verification
    // This is a simplified version - see AWS docs for complete implementation
    const signature = headers.get('x-amz-sns-message-id');
    return !!signature; // For now, just check if the header exists
  } catch (error) {
    console.error('SNS signature verification failed:', error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const headers = request.headers;

    // Verify SNS signature (in production)
    if (process.env.NODE_ENV === 'production') {
      const isValid = await verifySNSSignature(headers, body);
      if (!isValid) {
        console.error('Invalid SNS signature');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    const snsMessage: SNSMessage = JSON.parse(body);

    // Handle SNS subscription confirmation
    if (snsMessage.Type === 'SubscriptionConfirmation') {
      console.log('SNS Subscription confirmation received:', snsMessage.SubscribeURL);
      
      // In production, you should automatically confirm the subscription
      // by making a GET request to the SubscribeURL
      if (snsMessage.SubscribeURL) {
        try {
          const response = await fetch(snsMessage.SubscribeURL);
          console.log('Subscription confirmed:', response.status);
        } catch (error) {
          console.error('Failed to confirm subscription:', error);
        }
      }
      
      return NextResponse.json({ message: 'Subscription confirmation received' });
    }

    // Handle notification messages
    if (snsMessage.Type === 'Notification') {
      const sesEvent: SESEventRecord = JSON.parse(snsMessage.Message);
      
      console.log('Received SES event:', {
        eventType: sesEvent.eventType,
        messageId: sesEvent.mail.messageId,
        destination: sesEvent.mail.destination,
      });

      // Extract campaign ID from email headers or tags
      const campaignId = extractCampaignId(sesEvent);
      
      if (!campaignId) {
        console.warn('No campaign ID found in SES event, skipping');
        return NextResponse.json({ message: 'No campaign ID found' });
      }

      // Process each recipient
      for (const recipientEmail of sesEvent.mail.destination) {
        await processEventForRecipient(sesEvent, recipientEmail, campaignId);
      }

      return NextResponse.json({ message: 'Event processed successfully' });
    }

    return NextResponse.json({ message: 'Unknown message type' });

  } catch (error) {
    console.error('Error processing SES webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function extractCampaignId(sesEvent: SESEventRecord): string | null {
  // Try to get campaign ID from email tags first
  if (sesEvent.mail.tags?.campaignId?.[0]) {
    return sesEvent.mail.tags.campaignId[0];
  }

  // Try to get from custom headers
  if (sesEvent.mail.headers) {
    const campaignHeader = sesEvent.mail.headers.find(
      header => header.name.toLowerCase() === 'x-campaign-id'
    );
    if (campaignHeader) {
      return campaignHeader.value;
    }
  }

  // Campaign ID should be available via tags or headers
  // No longer parsing from subject line to keep subjects clean

  return null;
}

async function processEventForRecipient(
  sesEvent: SESEventRecord,
  recipientEmail: string,
  campaignId: string
) {
  try {
    // Find the subscriber
    const subscriber = await prisma.subscriber.findFirst({
      where: {
        email: recipientEmail,
      },
    });

    if (!subscriber) {
      console.warn(`Subscriber not found for email: ${recipientEmail}`);
      return;
    }

    // Map the event type
    const eventType = mapEventType(sesEvent.eventType);

    // Prepare event data
    const eventData: any = {
      messageId: sesEvent.mail.messageId,
      timestamp: sesEvent.mail.timestamp,
    };

    // Add specific event data based on type
    switch (sesEvent.eventType) {
      case 'bounce':
        if (sesEvent.bounce) {
          eventData.bounceType = sesEvent.bounce.bounceType;
          eventData.bounceSubType = sesEvent.bounce.bounceSubType;
          const bouncedRecipient = sesEvent.bounce.bouncedRecipients.find(
            r => r.emailAddress === recipientEmail
          );
          if (bouncedRecipient) {
            eventData.diagnosticCode = bouncedRecipient.diagnosticCode;
          }
        }
        break;

      case 'complaint':
        if (sesEvent.complaint) {
          eventData.complaintFeedbackType = sesEvent.complaint.complaintFeedbackType;
        }
        break;

      case 'click':
        if (sesEvent.click) {
          eventData.link = sesEvent.click.link;
          eventData.linkTags = sesEvent.click.linkTags;
        }
        break;

      case 'open':
        if (sesEvent.open) {
          eventData.userAgent = sesEvent.open.userAgent;
          eventData.ipAddress = sesEvent.open.ipAddress;
        }
        break;

      case 'delivery':
        if (sesEvent.delivery) {
          eventData.processingTimeMillis = sesEvent.delivery.processingTimeMillis;
        }
        break;
    }

    // Create the event record
    await prisma.event.create({
      data: {
        type: eventType as any,
        data: eventData,
        subscriberId: subscriber.id,
        campaignId: campaignId,
        createdAt: new Date(sesEvent.mail.timestamp),
      },
    });

    // Update subscriber status for certain events
    if (sesEvent.eventType === 'bounce' && sesEvent.bounce?.bounceType === 'Permanent') {
      await prisma.subscriber.update({
        where: { id: subscriber.id },
        data: { status: 'BOUNCED' },
      });
    } else if (sesEvent.eventType === 'complaint') {
      await prisma.subscriber.update({
        where: { id: subscriber.id },
        data: { status: 'COMPLAINED' },
      });
    }

    console.log(`Event ${eventType} processed for ${recipientEmail} in campaign ${campaignId}`);

  } catch (error) {
    console.error(`Error processing event for ${recipientEmail}:`, error);
  }
}

// Handle unsubscribe events (if using SES subscription management)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  const email = searchParams.get('email');

  if (!token || !email) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  try {
    // Verify the unsubscribe token (implement your own logic)
    const isValidToken = await verifyUnsubscribeToken(email, token);
    
    if (!isValidToken) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Update subscriber status
    await prisma.subscriber.updateMany({
      where: { email },
      data: { status: 'UNSUBSCRIBED' },
    });

    // Create unsubscribe event
    const subscriber = await prisma.subscriber.findFirst({
      where: { email },
    });

    if (subscriber) {
      await prisma.event.create({
        data: {
          type: 'UNSUBSCRIBED',
          data: { method: 'link' },
          subscriberId: subscriber.id,
        },
      });
    }

    return NextResponse.json({ message: 'Successfully unsubscribed' });

  } catch (error) {
    console.error('Error processing unsubscribe:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function verifyUnsubscribeToken(email: string, token: string): Promise<boolean> {
  // Implement your token verification logic
  // This could involve HMAC verification or database lookup
  const expectedToken = crypto
    .createHmac('sha256', process.env.BETTER_AUTH_SECRET || 'fallback-secret')
    .update(email)
    .digest('hex');
  
  return token === expectedToken;
}