import { sendEmail } from '../ses';

export async function sendVerificationEmail({ 
  email, 
  url,
  name 
}: { 
  email: string; 
  url: string; 
  name?: string; 
}) {
  const subject = name
    ? `${name}, Final step to Onboard!`
    : 'Final step to Onboard!';
  const html = `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Verify Your Email</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>

  <body style="margin:0; padding:0; background-color:#f4f6f8; font-family:Arial, Helvetica, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table
            width="100%"
            max-width="600"
            cellpadding="0"
            cellspacing="0"
            style="background:#ffffff; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.05);"
          >
            <!-- Header -->
            <tr>
              <td style="padding:32px 32px 16px;">
                <h1 style="margin:0; font-size:24px; color:#111827;">
                  Please verify your email address
                </h1>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:0 32px 24px; color:#374151; font-size:16px; line-height:1.6;">
                <p style="margin:0 0 16px;">
                  Thanks for signing up! Please confirm your email address to
                  activate your account with MailPackr.
                </p>

                <p style="margin:0 0 24px;">
                  Click the button below to verify your email:
                </p>

                <!-- Button -->
                <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                  <tr>
                    <td align="center">
                      <a
                        href="${url}"
                        target="_blank"
                        style="
                          display:inline-block;
                          padding:14px 28px;
                          background-color:#101827;
                          color:#ffffff;
                          text-decoration:none;
                          font-size:16px;
                          font-weight:600;
                          border-radius:6px;
                        "
                      >
                        Verify Email Address
                      </a>
                    </td>
                  </tr>
                </table>

                <!-- Fallback link -->
                <p style="margin:24px 0 0; font-size:14px; color:#6b7280;">
                  If the button doesn’t work, copy and paste this link into your browser:
                </p>
                <p style="word-break:break-all; font-size:14px; color:#2563eb; margin:8px 0 0;">
                  <a href="${url}" target="_blank" style="color:#2563eb; text-decoration:none;">
                    ${url}
                  </a>
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td
                style="
                  padding:24px 32px;
                  background:#f9fafb;
                  border-radius:0 0 8px 8px;
                  font-size:13px;
                  color:#6b7280;
                "
              >
                <p style="margin:0;">
                  This link will expire in 1 hour for security reasons. If you didn’t create an account,
                  you can safely ignore this email.
                </p>
                <p style="margin:12px 0 0;">
                  Thanks,
                </p>
                <p style="margin:8px 0 0;">
                  MailPackr
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;

  const res = await sendEmail({
    to: [email],
    subject,
    html,
    from: process.env.FROM_EMAIL!,
    replyTo: process.env.REPLY_TO_EMAIL!,
  });

  if (!res.success) {
    throw new Error('Failed to send verification email');
  }
  
  return res;
}
