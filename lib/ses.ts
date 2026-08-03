import { SESClient } from '@aws-sdk/client-ses';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

// Function to wrap text content in full HTML structure
function wrapInFullHtml(content: string, isHtml: boolean = false): string {
  if (isHtml && content.toLowerCase().includes('<!doctype html')) {
    // Already a full HTML document, just ensure it has the basic structure
    return content;
  }

  const htmlContent = isHtml ? content : content.replace(/\n/g, '<br>');

  return `<!doctype html>
<html lang="und" dir="auto" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style type="text/css">
    body { margin: 0; padding: 20px; font-family: Arial, sans-serif; line-height: 1.6; }
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>`;
}

const clientConfig = {
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  // Add timeout configuration
  requestHandler: {
    requestTimeout: 30000, // 30 seconds
    connectionTimeout: 10000, // 10 seconds
  },
  maxAttempts: 3,
  retryMode: 'adaptive',
};

// All sending goes through the v2 API. Auto Validation, and every other feature
// configured via PutAccountSuppressionAttributes, is only surfaced on SESv2.
export const sesv2Client = new SESv2Client(clientConfig);

// Retained for the identity/domain operations that only exist on the classic API
// (VerifyDomainIdentity, VerifyDomainDkim, DeleteIdentity, ...), used by
// lib/domain-verification.ts and the app/api/domains routes.
export const sesClient = new SESClient(clientConfig);

export interface SendEmailParams {
  to: string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  configurationSetName?: string;
  campaignId?: string;
  subscriberId?: string;
  messageId?: string;
}

function buildSesTags({
  campaignId,
  subscriberId,
  messageId,
}: {
  campaignId?: string;
  subscriberId?: string;
  messageId?: string;
}): { Name: string; Value: string }[] | undefined {
  const tags: { Name: string; Value: string }[] = [];
  if (campaignId) tags.push({ Name: 'campaignId', Value: campaignId });
  if (subscriberId) tags.push({ Name: 'subscriberId', Value: subscriberId });
  if (messageId) tags.push({ Name: 'messageId', Value: messageId });
  return tags.length > 0 ? tags : undefined;
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  from,
  replyTo,
  configurationSetName = process.env.AWS_SES_CONFIGURATION_SET,
  campaignId,
  subscriberId,
  messageId,
}: SendEmailParams): Promise<{
  success: boolean;
  sesMessageId?: string;
  error?: { code: string; message: string };
}> {
  // Get the recipient email for tracking
  const recipientEmail = to[0]; // Assuming single recipient per call

  // Always ensure we have HTML content - wrap text in full HTML if needed
  let fullHtml = html;
  if (!html && text) {
    // Convert text to HTML format
    fullHtml = wrapInFullHtml(text, false);
  } else if (html) {
    // Ensure HTML is in full document format
    fullHtml = wrapInFullHtml(html, true);
  } else {
    // Fallback to empty HTML structure
    fullHtml = wrapInFullHtml('', false);
  }

  // Use HTML content directly - AWS SES handles click tracking automatically
  const processedHtml = fullHtml;

  // Use the original subject without campaign metadata (tracking is done via SES tags)
  const trackedSubject = subject;

  const command = new SendEmailCommand({
    FromEmailAddress: from,
    Destination: {
      ToAddresses: to,
    },
    Content: {
      Simple: {
        Subject: {
          Data: trackedSubject,
          Charset: 'UTF-8',
        },
        Body: {
          Html: {
            Data: processedHtml,
            Charset: 'UTF-8',
          },
          // Always send HTML, remove text version to ensure HTML rendering
        },
      },
    },
    ReplyToAddresses: replyTo ? [replyTo] : undefined,
    ConfigurationSetName: configurationSetName,
    EmailTags: buildSesTags({ campaignId, subscriberId, messageId }),
  });

  try {
    // Send email via SES
    const result = await sesv2Client.send(command);

    return { success: true, sesMessageId: result.MessageId };
  } catch (error: any) {
    // Return structured error instead of throwing
    return {
      success: false,
      error: {
        code: error.code || error.name || 'UnknownError',
        message: error.message || 'Unknown SES error',
      },
    };
  }
}
