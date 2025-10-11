import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
// import { CampaignProgressTracker } from '@/lib/campaign-progress';
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
  
  return mapping[sesEventType.toLowerCase()] || sesEventType.toUpperCase();
};

// Verify SNS signature for production
async function verifySNSSignature(headers: Headers, body: string): Promise<boolean> {
  try {
    const messageId = headers.get('x-amz-sns-message-id');
    const messageType = headers.get('x-amz-sns-message-type');
    const topicArn = headers.get('x-amz-sns-topic-arn');
    
    // Basic header validation
    if (!messageId || !messageType || !topicArn) {
      console.error('Missing required SNS headers');
      return false;
    }

    // Parse the message to get signature details
    const message = JSON.parse(body);
    const signature = message.Signature;
    const signingCertURL = message.SigningCertURL;
    
    if (!signature || !signingCertURL) {
      console.error('Missing signature or signing cert URL');
      return false;
    }

    // Verify the signing cert URL is from AWS
    const certUrl = new URL(signingCertURL);
    if (!certUrl.hostname.endsWith('.amazonaws.com')) {
      console.error('Invalid signing cert URL domain');
      return false;
    }

    // For production, you should implement full signature verification
    // This requires downloading the cert and verifying the signature
    // For now, we'll validate the basic structure and headers
    console.log('SNS signature validation passed basic checks');
    return true;
    
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
    // if (process.env.NODE_ENV === 'production') {
      const isValid = await verifySNSSignature(headers, body);
      if (!isValid) {
        console.error('Invalid SNS signature');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    // }

    const snsMessage: SNSMessage = JSON.parse(body);
    // console.log("snsMessage Details: ", snsMessage) // " sesEvent Detailss: ", JSON.parse(snsMessage.Message)
    // Handle SNS subscription confirmation
    if (snsMessage.Type === 'SubscriptionConfirmation') {
      // console.log('SNS Subscription confirmation received for topic:', snsMessage.TopicArn);
      // console.log('Token:', snsMessage.Token);
      // console.log('SubscribeURL:', snsMessage.SubscribeURL);
      
      // Automatically confirm the subscription by making a GET request to the SubscribeURL
      if (snsMessage.SubscribeURL) {
        try {
          // console.log('Confirming subscription...');
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          
          const response = await fetch(snsMessage.SubscribeURL, {
            method: 'GET',
            signal: controller.signal,
          });
          
          clearTimeout(timeoutId);
          
          if (response.ok) {
            const responseText = await response.text();
            // console.log('✅ Subscription confirmed successfully:', response.status);
            // console.log('Response snippet:', responseText.substring(0, 200));
            
            return NextResponse.json({ 
              message: 'Subscription confirmed successfully',
              topicArn: snsMessage.TopicArn,
              subscriptionArn: responseText.includes('SubscriptionArn') ? 'Extracted from response' : 'Not available'
            });
          } else {
            console.error('❌ Failed to confirm subscription - HTTP error:', response.status);
            return NextResponse.json({ 
              error: 'Failed to confirm subscription',
              status: response.status,
              topicArn: snsMessage.TopicArn
            }, { status: 500 });
          }
        } catch (error) {
          console.error('❌ Failed to confirm subscription - Network error:', error);
          return NextResponse.json({ 
            error: 'Failed to confirm subscription',
            details: error instanceof Error ? error.message : 'Unknown error',
            topicArn: snsMessage.TopicArn
          }, { status: 500 });
        }
      } else {
        console.error('❌ No SubscribeURL provided in confirmation message');
        return NextResponse.json({ 
          error: 'No SubscribeURL provided',
          topicArn: snsMessage.TopicArn
        }, { status: 400 });
      }
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

    // Check for existing event to prevent duplicates
    // Look for events with same type, subscriber, campaign, and messageId within last 10 minutes
    const existingEvent = await prisma.event.findFirst({
      where: {
        campaignId,
        subscriberId: subscriber.id,
        type: eventType as
          | 'DELIVERED'
          | 'OPENED'
          | 'CLICKED'
          | 'BOUNCED'
          | 'COMPLAINED'
          | 'UNSUBSCRIBED'
          | 'SENT',
        createdAt: {
          gte: new Date(Date.now() - 10 * 60 * 1000), // Within last 10 minutes
        },
        // Also check if the event data contains the same messageId
        data: {
          path: ['messageId'],
          equals: sesEvent.mail.messageId,
        },
      },
    });

    if (existingEvent) {
      console.log(
        `Skipping duplicate event: ${eventType} for ${recipientEmail} in campaign ${campaignId} (messageId: ${sesEvent.mail.messageId})`
      );
      return;
    }

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
            (r) => r.emailAddress === recipientEmail
          );
          if (bouncedRecipient) {
            eventData.diagnosticCode = bouncedRecipient.diagnosticCode;
          }
        }
        break;

      case 'complaint':
        if (sesEvent.complaint) {
          eventData.complaintFeedbackType =
            sesEvent.complaint.complaintFeedbackType;
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
          eventData.processingTimeMillis =
            sesEvent.delivery.processingTimeMillis;
        }
        break;
    }

    // Create the event record
    const newEvent = await prisma.event.create({
      data: {
        type: eventType as
          | 'DELIVERED'
          | 'OPENED'
          | 'CLICKED'
          | 'BOUNCED'
          | 'COMPLAINED'
          | 'UNSUBSCRIBED'
          | 'SENT',
        data: eventData,
        subscriberId: subscriber.id,
        campaignId: campaignId,
        createdAt: new Date(sesEvent.mail.timestamp),
      },
      include: {
        subscriber: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Update subscriber status for certain events
    if (
      sesEvent.eventType === 'bounce' &&
      sesEvent.bounce?.bounceType === 'Permanent'
    ) {
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

    // // Update progress tracking in Redis
    // try {
    //   if (eventType === 'SENT') {
    //     await CampaignProgressTracker.incrementSent(campaignId);
    //   } else if (eventType === 'BOUNCED') {
    //     await CampaignProgressTracker.incrementBounced(campaignId);
    //   }

    //   // Check if campaign is now complete
    //   await CampaignProgressTracker.checkAndMarkComplete(campaignId);
    // } catch (progressError) {
    //   console.error('Error updating campaign progress:', progressError);
    // }

    // Broadcast the event to real-time listeners
    try {
      const { broadcastEvent } = await import('@/lib/event-broadcast');
      await broadcastEvent(campaignId, newEvent);
    } catch (error) {
      console.error('Error broadcasting event:', error);
    }

    console.log(
      `Event ${eventType} processed for ${recipientEmail} in campaign ${campaignId}`
    );
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