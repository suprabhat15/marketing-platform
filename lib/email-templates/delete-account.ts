import { sendEmail } from '../ses';

export async function sendDeleteAccountVerificationEmail({
  email,
  url,
  name,
}: {
  email: string;
  url: string;
  name?: string;
}) {
  const subject = name
    ? `${name.replace(/[\r\n]/g, '')}, confirm account deletion`
    : 'Confirm account deletion';

  const html = `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Confirm Account Deletion</title>
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
            <tr>
              <td style="padding:32px 32px 16px;">
                <h1 style="margin:0; font-size:24px; color:#111827;">
                  Confirm account deletion
                </h1>
              </td>
            </tr>

            <tr>
              <td style="padding:0 32px 24px; color:#374151; font-size:16px; line-height:1.6;">
                <p style="margin:0 0 16px;">
                  We received a request to permanently delete your MailPackr account and all related data.
                </p>

                <p style="margin:0 0 16px;">
                  To continue, open the link below from the same browser where you are currently signed in.
                </p>

                <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                  <tr>
                    <td align="center">
                      <a
                        href="${url}"
                        target="_blank"
                        style="
                          display:inline-block;
                          padding:14px 28px;
                          background-color:#b91c1c;
                          color:#ffffff;
                          text-decoration:none;
                          font-size:16px;
                          font-weight:600;
                          border-radius:6px;
                        "
                      >
                        Delete My Account
                      </a>
                    </td>
                  </tr>
                </table>

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
                  This action is permanent. If you didn’t request this, you can ignore this email and keep your account.
                </p>
                <p style="margin:12px 0 0;">
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

  const result = await sendEmail({
    to: [email],
    subject,
    html,
    from: process.env.FROM_EMAIL!,
    replyTo: process.env.REPLY_TO_EMAIL || '',
  });

  if (!result.success) {
    throw new Error('Failed to send delete account verification email');
  }

  return result;
}
