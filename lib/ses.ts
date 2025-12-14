import { SESClient, SendEmailCommand, SendBulkTemplatedEmailCommand, SendRawEmailCommand } from '@aws-sdk/client-ses';
import { prepareEmailWithAttachments, createSESCommandWithAttachments } from './email-attachments';

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

export const sesClient = new SESClient({
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

export interface SendEmailWithAttachmentsParams extends SendEmailParams {
  extractAttachments?: boolean; // Whether to extract base64 images as attachments
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
}: SendEmailParams): Promise<{
  success: boolean;
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

  // Add tracking pixel for open tracking (hide campaignId but include in encrypted payload)
  // const trackingData = campaignId
  //   ? Buffer.from(
  //       JSON.stringify({
  //         email: recipientEmail,
  //         campaignId,
  //         messageId: messageId || Date.now().toString(),
  //       })
  //     ).toString('base64')
  //   : '';

  // const trackingPixel = campaignId
  //   ? `<img src="${process.env.NEXT_PUBLIC_APP_URL}/api/track/open?t=${trackingData}" width="1" height="1" alt="" style="display:block!important;border:0!important;outline:none!important;" />`
  //   : '';

  // Process HTML to add click tracking
  let processedHtml = campaignId
    ? addClickTracking(fullHtml, campaignId, messageId)
    : fullHtml;

  // Replace {{email}} placeholder in tracking URLs with actual email
  if (campaignId) {
    processedHtml = processedHtml.replace(
      /{{email}}/g,
      encodeURIComponent(recipientEmail)
    );
  }

  // Add tracking pixel before closing body tag
  // if (trackingPixel) {
  //   processedHtml = processedHtml.replace(
  //     '</body>',
  //     `  ${trackingPixel}\n</body>`
  //   );
  // }

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
          Data: processedHtml,
          Charset: 'UTF-8',
        },
        // Always send HTML, remove text version to ensure HTML rendering
      },
    },
    ReplyToAddresses: replyTo ? [replyTo] : undefined,
    ConfigurationSetName: configurationSetName,
    Tags: campaignId
      ? [
          {
            Name: 'campaignId',
            Value: campaignId,
          },
          ...(messageId
            ? [
                {
                  Name: 'messageId',
                  Value: messageId,
                },
              ]
            : []),
        ]
      : undefined,
  });

  try {
    // Send email via SES
    const result = await sesClient.send(command);

    return { success: true };
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

export async function sendEmailWithAttachments({
  to,
  subject,
  html,
  text,
  from = process.env.FROM_EMAIL!,
  replyTo = process.env.REPLY_TO_EMAIL!,
  configurationSetName = process.env.AWS_SES_CONFIGURATION_SET,
  campaignId,
  messageId,
  extractAttachments = true,
}: SendEmailWithAttachmentsParams): Promise<{
  success: boolean;
  error?: { code: string; message: string };
}> {
  // Add timeout wrapper
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('SES request timeout')), 25000); // 25 second timeout
  });

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

  // Add tracking pixel for open tracking (hide campaignId but include in encrypted payload)
  // const trackingData = campaignId
  //   ? Buffer.from(
  //       JSON.stringify({
  //         email: recipientEmail,
  //         campaignId,
  //         messageId: messageId || Date.now().toString(),
  //       })
  //     ).toString('base64')
  //   : '';

  // const trackingPixel = campaignId
  //   ? `<img src="${process.env.NEXT_PUBLIC_APP_URL}/api/track/open?t=${trackingData}" width="1" height="1" alt="" style="display:block!important;border:0!important;outline:none!important;" />`
  //   : '';

  // Process HTML to add click tracking
  let processedHtml = campaignId
    ? addClickTracking(fullHtml, campaignId, messageId)
    : fullHtml;

  // Replace {{email}} placeholder in tracking URLs with actual email
  if (campaignId) {
    processedHtml = processedHtml.replace(
      /{{email}}/g,
      encodeURIComponent(recipientEmail)
    );
  }

  // Add tracking pixel before closing body tag
  // if (trackingPixel) {
  //   processedHtml = processedHtml.replace(
  //     '</body>',
  //     `  ${trackingPixel}\n</body>`
  //   );
  // }

  try {
    let command: SendRawEmailCommand | SendEmailCommand;

    if (extractAttachments) {
      // Check if HTML contains base64 images
      const hasBase64Images = /data:image\/[^;]+;base64,/.test(processedHtml);
      
      if (hasBase64Images) {
        // Use raw email with attachments
        const emailWithAttachments = prepareEmailWithAttachments(
          to,
          from,
          subject,
          processedHtml,
          text
        );

        command = createSESCommandWithAttachments(emailWithAttachments, configurationSetName);
      } else {
        // Fall back to regular email sending
        command = new SendEmailCommand({
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
                Data: processedHtml,
                Charset: 'UTF-8',
              },
            },
          },
          ReplyToAddresses: replyTo ? [replyTo] : undefined,
          ConfigurationSetName: configurationSetName,
          Tags: campaignId
            ? [
                {
                  Name: 'campaignId',
                  Value: campaignId,
                },
                ...(messageId
                  ? [
                      {
                        Name: 'messageId',
                        Value: messageId,
                      },
                    ]
                  : []),
              ]
            : undefined,
        });
      }
    } else {
      // Use regular email sending without attachment processing
      command = new SendEmailCommand({
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
              Data: processedHtml,
              Charset: 'UTF-8',
            },
          },
        },
        ReplyToAddresses: replyTo ? [replyTo] : undefined,
        ConfigurationSetName: configurationSetName,
        Tags: campaignId
          ? [
              {
                Name: 'campaignId',
                Value: campaignId,
              },
              ...(messageId
                ? [
                    {
                      Name: 'messageId',
                      Value: messageId,
                    },
                  ]
                : []),
            ]
          : undefined,
      });
    }

    // Race between SES call and timeout
    const result = await Promise.race([
      sesClient.send(command as any),
      timeoutPromise,
    ]);

    return { success: true };
  } catch (error: any) {
    // Handle timeout specifically
    if (error.message === 'SES request timeout') {
      return {
        success: false,
        error: {
          code: 'TimeoutError',
          message: 'SES request timed out after 25 seconds',
        },
      };
    }

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