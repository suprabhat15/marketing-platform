import { SESClient, SendEmailCommand, SendBulkTemplatedEmailCommand } from '@aws-sdk/client-ses';

// Function to add click tracking to HTML content
function addClickTracking(html: string, campaignId: string, messageId?: string): string {
  // Replace all href attributes with tracking URLs
  return html.replace(
    /href\s*=\s*["']([^"']+)["']/gi,
    (match, url) => {
      // Skip if it's already a tracking URL or if it's a mailto/tel link
      if (url.includes('/api/track/click') || url.startsWith('mailto:') || url.startsWith('tel:')) {
        return match;
      }
      
      const trackingUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/track/click?cid=${campaignId}&url=${encodeURIComponent(url)}&email={{email}}&mid=${messageId || Date.now()}`;
      return `href="${trackingUrl}"`;
    }
  );
}

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
  campaignId?: string;
  messageId?: string;
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  from = process.env.FROM_EMAIL!,
  replyTo = process.env.REPLY_TO_EMAIL!,
  configurationSetName = process.env.AWS_SES_CONFIGURATION_SET,
  campaignId,
  messageId,
}: SendEmailParams) {
  // Get the recipient email for tracking
  const recipientEmail = to[0]; // Assuming single recipient per call
  
  // Add tracking pixel for open tracking (hide campaignId but include in encrypted payload)
  const trackingData = campaignId ? Buffer.from(JSON.stringify({
    email: recipientEmail,
    campaignId,
    messageId: messageId || Date.now().toString()
  })).toString('base64') : '';
  
  const trackingPixel = campaignId ? 
    `<img src="${process.env.NEXT_PUBLIC_APP_URL}/api/track/open?t=${trackingData}" width="1" height="1" alt="" style="display:block!important;border:0!important;outline:none!important;" />` : '';
  
  // Process HTML to add click tracking
  let processedHtml = campaignId ? addClickTracking(html, campaignId, messageId) : html;
  
  // Replace {{email}} placeholder in tracking URLs with actual email
  if (campaignId) {
    processedHtml = processedHtml.replace(/{{email}}/g, encodeURIComponent(recipientEmail));
  }
  
  // Use the original subject without campaign metadata (tracking is done via SES tags)
  const trackedSubject = subject;

  const command = new SendEmailCommand({
    Source: from,
    Destination: {
      ToAddresses: to,
    },
    Message: {
      Subject: {
        Data: trackedSubject,
        Charset: 'UTF-8',
      },
      Body: {
        Html: {
          Data: processedHtml + trackingPixel,
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
    ReplyToAddresses: replyTo ? [replyTo] : undefined,
    ConfigurationSetName: configurationSetName,
    Tags: campaignId ? [
      {
        Name: 'campaignId',
        Value: campaignId,
      },
      ...(messageId ? [{
        Name: 'messageId',
        Value: messageId,
      }] : []),
    ] : undefined,
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
  campaignId?: string;
}

export async function sendBulkEmail({
  destinations,
  template,
  defaultReplacementData = {},
  from = process.env.FROM_EMAIL!,
  replyTo,
  configurationSetName = process.env.AWS_SES_CONFIGURATION_SET,
  campaignId,
}: SendBulkEmailParams) {
  const command = new SendBulkTemplatedEmailCommand({
    Source: from,
    Template: template,
    DefaultTemplateData: JSON.stringify({
      ...defaultReplacementData,
      campaignId: campaignId || '',
      trackingDomain: process.env.NEXT_PUBLIC_APP_URL || '',
    }),
    Destinations: destinations.map((dest) => ({
      Destination: {
        ToAddresses: [dest.email],
      },
      ReplacementTemplateData: JSON.stringify({
        ...dest.replacementData,
        email: dest.email, // Ensure email is available for tracking
      }),
    })),
    ReplyToAddresses: replyTo ? [replyTo] : undefined,
    ConfigurationSetName: configurationSetName,
  });

  return await sesClient.send(command);
}