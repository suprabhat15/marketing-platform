import { SESClient, SendEmailCommand, SendBulkTemplatedEmailCommand } from '@aws-sdk/client-ses';

const sesClient = new SESClient({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export interface SendEmailParams {
  to: string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  configurationSetName?: string;
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  from = process.env.FROM_EMAIL!,
  replyTo = process.env.REPLY_TO_EMAIL!,
  configurationSetName = process.env.AWS_SES_CONFIGURATION_SET,
}: SendEmailParams) {
  const command = new SendEmailCommand({
    Source: from,
    Destination: {
      ToAddresses: to,
    },
    Message: {
      Subject: {
        Data: subject,
        Charset: 'UTF-8',
      },
      Body: {
        Html: {
          Data: html,
          Charset: 'UTF-8',
        },
        Text: text
          ? {
              Data: text,
              Charset: 'UTF-8',
            }
          : undefined,
      },
    },
    ReplyToAddresses: replyTo ? [replyTo] : undefined, // If the recipient replies to the message, 
    // each reply-to address receives the reply.
    ConfigurationSetName: configurationSetName,
  });

  return await sesClient.send(command);
}

export interface BulkEmailDestination {
  email: string;
  replacementData: Record<string, string>;
}

export interface SendBulkEmailParams {
  destinations: BulkEmailDestination[];
  template: string;
  defaultReplacementData?: Record<string, string>;
  from?: string;
  replyTo?: string;
  configurationSetName?: string;
}

export async function sendBulkEmail({
  destinations,
  template,
  defaultReplacementData = {},
  from = process.env.FROM_EMAIL!,
  replyTo,
  configurationSetName = process.env.AWS_SES_CONFIGURATION_SET,
}: SendBulkEmailParams) {
  const command = new SendBulkTemplatedEmailCommand({
    Source: from,
    Template: template,
    DefaultTemplateData: JSON.stringify(defaultReplacementData),
    Destinations: destinations.map((dest) => ({
      Destination: {
        ToAddresses: [dest.email],
      },
      ReplacementTemplateData: JSON.stringify(dest.replacementData),
    })),
    ReplyToAddresses: replyTo ? [replyTo] : undefined,
    ConfigurationSetName: configurationSetName,
  });

  return await sesClient.send(command);
}