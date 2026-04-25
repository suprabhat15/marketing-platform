import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
  throw new Error('Missing required AWS credentials: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set');
}

const sqs = new SQSClient({
  region: 'us-east-1',
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

const POLAR_EVENTS_QUEUE_URL = process.env.AWS_POLAR_SQS_URL;
const SES_EVENTS_QUEUE_URL = process.env.AWS_SES_EVENTS_SQS_URL;

if (!POLAR_EVENTS_QUEUE_URL) {
  throw new Error(
    'Missing required environment variable: AWS_POLAR_SQS_URL must be set'
  );
}

export interface PolarEventMessage {
  userId: string;
  eventType: string;
  metadata?: Record<string, any>;
}

// Send per-email Polar event to SQS. The Lambda consumer aggregates records per
// invocation into a single polar.events.ingest call, so 1 SQS message = 1 real
// send = 1 credit on Polar. Partial batch failures self-correct because failed
// emails never emit a message.
export async function sendPolarEventToSQS(
  message: PolarEventMessage
): Promise<void> {
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('SQS call timeout')), 5000);
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
        ...(message.metadata?.eventId &&
          typeof message.metadata.eventId === 'string' && {
            eventId: {
              DataType: 'String',
              StringValue: message.metadata.eventId,
            },
          }),
      },
    });

    await Promise.race([sqs.send(command), timeoutPromise]);
    console.log(
      `✅ Polar event sent to SQS: ${message.eventType} for user ${message.userId}`
    );
  } catch (error) {
    console.error('❌ Failed to send Polar event to SQS:', error);
    throw new Error(
      `Failed to send event to SQS: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// Synthetic SES-style event the Lambda consumes alongside SNS-delivered events.
// Used for failures (FAILED) the app records before SES accepts the message and
// for unsubscribes (UNSUBSCRIBED), neither of which generate SES notifications.
export interface SyntheticSesEventMessage {
  eventType: 'Failed' | 'Unsubscription';
  campaignId: string;
  subscriberId?: string;
  uniqueId: string;
  recipients?: number;
  metadata?: Record<string, any>;
}

export async function sendSesEventToSQS(
  message: SyntheticSesEventMessage
): Promise<void> {
  if (!SES_EVENTS_QUEUE_URL) {
    console.warn(
      '⚠️ AWS_SES_EVENTS_SQS_URL not set; skipping synthetic SES event'
    );
    return;
  }

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('SQS call timeout')), 5000);
  });

  const body = {
    synthetic: true,
    eventType: message.eventType,
    campaignId: message.campaignId,
    subscriberId: message.subscriberId,
    uniqueId: message.uniqueId,
    recipients: message.recipients ?? 1,
    metadata: message.metadata,
    timestamp: new Date().toISOString(),
  };

  try {
    const command = new SendMessageCommand({
      QueueUrl: SES_EVENTS_QUEUE_URL,
      MessageBody: JSON.stringify(body),
    });
    await Promise.race([sqs.send(command), timeoutPromise]);
    console.log(
      `✅ Synthetic SES event sent to SQS: ${message.eventType} campaign=${message.campaignId}`
    );
  } catch (error) {
    console.error('❌ Failed to send synthetic SES event to SQS:', error);
  }
}
