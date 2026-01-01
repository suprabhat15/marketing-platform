import { sendEmail } from '../ses';

export async function sendPasswordResetEmail({ 
  email, 
  url 
}: { 
  email: string; 
  url: string; 
}) {
  const subject = 'Reset your password';
  const text = `Click the link to reset your password: ${url}`;
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .button { display: inline-block; padding: 12px 24px; background-color: #000; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500; }
    .footer { margin-top: 30px; border-top: 1px solid #eaeaea; padding-top: 20px; font-size: 14px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Reset Your Password</h2>
    <p>We received a request to reset your password. Click the button below to choose a new one.</p>
    <p style="margin: 30px 0;">
      <a href="${url}" class="button">Reset Password</a>
    </p>
    <p>Or copy and paste this URL into your browser:</p>
    <p style="word-break: break-all; color: #666;">${url}</p>
    
    <div class="footer">
      <p>If you didn't request a password reset, you can safely ignore this email.</p>
    </div>
  </div>
</body>
</html>
  `;

  const res = await sendEmail({
    to: [email],
    subject,
    text,
    html,
    from: process.env.FROM_EMAIL!,
    replyTo: process.env.REPLY_TO_EMAIL || '',
  });

  if (!res.success) {
    throw new Error('Failed to send password reset email');
  }

  return res;
}
