import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

// Initialize SQS client
const sqs = new SQSClient({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const POLAR_EVENTS_QUEUE_URL = process.env.AWS_POLAR_SQS_URL;

export interface PolarEventMessage {
  userId: string;
  eventType: string;
  metadata?: Record<string, any>;
  // eventId: string;
  // campaignId?: string;
  // subscriberId?: string;
  // timestamp: string;
  // recipientEmail?: string;
}

// Send Polar event to SQS (Lambda will process automatically)
export async function sendPolarEventToSQS(message: PolarEventMessage): Promise<void> {
  try {
    // Add timeout to prevent hanging SQS calls
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('SQS call timeout')), 5000); // 5 second timeout
    });

    const command = new SendMessageCommand({
      QueueUrl: POLAR_EVENTS_QUEUE_URL,
      MessageBody: JSON.stringify(message),
      MessageAttributes: {
        eventType: {
          DataType: 'String',
          StringValue: message.eventType,
        },
        userId: {
          DataType: 'String',
          StringValue: message.userId,
        },
        ...(message.metadata?.eventId && {
          eventId: {
            DataType: 'String',
            StringValue: message.metadata.eventId,
          },
        }),
      },
    });

    // Race between SQS send and timeout
    await Promise.race([sqs.send(command), timeoutPromise]);
    console.log(`✅ Polar event sent to SQS: ${message.eventType} for user ${message.userId}`);
  } catch (error) {
    console.error('❌ Failed to send Polar event to SQS:', error);
    throw new Error(`Failed to send event to SQS: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}