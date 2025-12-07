import { SendRawEmailCommand } from '@aws-sdk/client-ses';

export interface Base64Attachment {
  filename: string;
  content: string; // base64 content
  contentType: string;
  contentId?: string; // For inline images
}

export interface EmailWithAttachments {
  to: string[];
  from: string;
  subject: string;
  html: string;
  text?: string;
  attachments: Base64Attachment[];
}

/**
 * Extract base64 images from HTML content and prepare them as attachments
 */
export function extractBase64ImagesFromHTML(html: string): {
  processedHtml: string;
  attachments: Base64Attachment[];
} {
  const attachments: Base64Attachment[] = [];
  let processedHtml = html;
  
  // Regular expression to find base64 images in src attributes
  const base64ImageRegex = /<img[^>]+src=["']data:([^;]+);base64,([^"']+)["'][^>]*>/gi;
  let match;
  let imageIndex = 0;

  while ((match = base64ImageRegex.exec(html)) !== null) {
    const [fullMatch, mimeType, base64Data] = match;
    const contentId = `image_${imageIndex}`;
    const filename = `image_${imageIndex}.${mimeType.split('/')[1] || 'jpg'}`;
    
    // Add to attachments array
    attachments.push({
      filename,
      content: base64Data,
      contentType: mimeType,
      contentId,
    });

    // Replace base64 src with cid reference for inline display
    processedHtml = processedHtml.replace(
      match[0],
      match[0].replace(`data:${mimeType};base64,${base64Data}`, `cid:${contentId}`)
    );

    imageIndex++;
  }

  return {
    processedHtml,
    attachments,
  };
}

/**
 * Create raw email MIME message with attachments
 */
export function createMimeMessage(email: EmailWithAttachments): string {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  const altBoundary = `----=_Alt_${Date.now()}_${Math.random().toString(36).substring(2)}`;

  let mimeMessage = '';

  // Headers
  mimeMessage += `From: ${email.from}\n`;
  mimeMessage += `To: ${email.to.join(', ')}\n`;
  mimeMessage += `Subject: ${email.subject}\n`;
  mimeMessage += `MIME-Version: 1.0\n`;
  mimeMessage += `Content-Type: multipart/related; boundary="${boundary}"\n\n`;

  // Main multipart/alternative container for text/html
  mimeMessage += `--${boundary}\n`;
  mimeMessage += `Content-Type: multipart/alternative; boundary="${altBoundary}"\n\n`;

  // Text part (if provided)
  if (email.text) {
    mimeMessage += `--${altBoundary}\n`;
    mimeMessage += `Content-Type: text/plain; charset=UTF-8\n`;
    mimeMessage += `Content-Transfer-Encoding: 8bit\n\n`;
    mimeMessage += `${email.text}\n\n`;
  }

  // HTML part
  mimeMessage += `--${altBoundary}\n`;
  mimeMessage += `Content-Type: text/html; charset=UTF-8\n`;
  mimeMessage += `Content-Transfer-Encoding: 8bit\n\n`;
  mimeMessage += `${email.html}\n\n`;

  // Close alternative boundary
  mimeMessage += `--${altBoundary}--\n\n`;

  // Attachments (inline images)
  email.attachments.forEach((attachment) => {
    mimeMessage += `--${boundary}\n`;
    mimeMessage += `Content-Type: ${attachment.contentType}\n`;
    mimeMessage += `Content-Transfer-Encoding: base64\n`;
    
    if (attachment.contentId) {
      mimeMessage += `Content-ID: <${attachment.contentId}>\n`;
      mimeMessage += `Content-Disposition: inline; filename="${attachment.filename}"\n\n`;
    } else {
      mimeMessage += `Content-Disposition: attachment; filename="${attachment.filename}"\n\n`;
    }

    // Add base64 content in chunks of 76 characters (RFC 2045)
    const base64Content = attachment.content.match(/.{1,76}/g)?.join('\n') || attachment.content;
    mimeMessage += `${base64Content}\n\n`;
  });

  // Close main boundary
  mimeMessage += `--${boundary}--\n`;

  return mimeMessage;
}

/**
 * Create AWS SES SendRawEmailCommand with attachments
 */
export function createSESCommandWithAttachments(
  email: EmailWithAttachments,
  configurationSetName?: string
): SendRawEmailCommand {
  const rawMessage = createMimeMessage(email);

  const params: any = {
    RawMessage: {
      Data: Buffer.from(rawMessage),
    },
    Destinations: email.to,
  };

  if (configurationSetName) {
    params.ConfigurationSetName = configurationSetName;
  }

  return new SendRawEmailCommand(params);
}

/**
 * Prepare email content for sending, extracting images as attachments
 */
export function prepareEmailWithAttachments(
  to: string[],
  from: string,
  subject: string,
  htmlContent: string,
  textContent?: string
): EmailWithAttachments {
  // Extract base64 images from HTML and convert to attachments
  const { processedHtml, attachments } = extractBase64ImagesFromHTML(htmlContent);

  return {
    to,
    from,
    subject,
    html: processedHtml,
    text: textContent,
    attachments,
  };
}