import { sendEmail } from '../ses';

export async function sendSuspensionEmail({
  email,
  name,
  reason,
  campaignName,
  bounceRate,
  complaintRate,
  violation,
}: {
  email: string;
  name: string | null;
  reason: string;
  campaignName: string;
  bounceRate: number;
  complaintRate: number;
  violation: 'bounce' | 'complaint' | 'both';
}) {
  let violationDetail = '';
  if (violation === 'bounce') {
    violationDetail = `Your campaign <strong>"${campaignName}"</strong> had a bounce rate of <strong>${bounceRate.toFixed(2)}%</strong>, which exceeds our maximum allowed threshold of <strong>3.5%</strong>.`;
  } else if (violation === 'complaint') {
    violationDetail = `Your campaign <strong>"${campaignName}"</strong> had a complaint rate of <strong>${complaintRate.toFixed(2)}%</strong>, which exceeds our maximum allowed threshold of <strong>0.1%</strong>.`;
  } else {
    violationDetail = `Your campaign <strong>"${campaignName}"</strong> had a bounce rate of <strong>${bounceRate.toFixed(2)}%</strong> (threshold: 3.5%) and a complaint rate of <strong>${complaintRate.toFixed(2)}%</strong> (threshold: 0.1%).`;
  }

  const subject = 'Your account has been suspended';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Account Suspended</title>
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
              <h1 style="margin:0; font-size:24px; color:#dc2626;">
                Your account has been suspended
              </h1>
            </td>
          </tr>

          <tr>
            <td style="padding:0 32px 24px; color:#374151; font-size:16px; line-height:1.6;">
              <p style="margin:0 0 16px;">
                Hi${name ? ` ${name}` : ''},
              </p>

              <p style="margin:0 0 16px;">
                Your account has been suspended as you breached the ${violation === 'bounce' ? 'bounce rate' : violation === 'complaint' ? 'complaint rate' : 'bounce or complaint rate'} limit.
              </p>

              <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:6px; padding:16px; margin:0 0 16px;">
                <p style="margin:0; color:#991b1b; font-size:14px;">
                  ${violationDetail}
                </p>
              </div>

              <p style="margin:0 0 16px;">
                As a result, the following actions have been taken:
              </p>

              <ul style="margin:0 0 16px; padding-left:20px; color:#374151;">
                <li style="margin-bottom:8px;">Your campaign has been cancelled immediately</li>
                <li style="margin-bottom:8px;">All scheduled and in-progress campaigns have been stopped</li>
                <li style="margin-bottom:8px;">Your account has been suspended from all features</li>
              </ul>

              <p style="margin:0 0 16px;">
                <strong>Why does this matter?</strong> High bounce and complaint rates damage sender reputation and can lead to email deliverability issues for all users on our platform. AWS SES enforces strict thresholds to maintain healthy sending practices.
              </p>

              <p style="margin:0 0 16px;">
                To resolve this, please reply to this email or contact our support team. We will review your account and work with you to restore access after verifying that your mailing lists have been cleaned.
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
                If you believe this is a mistake, please contact us immediately.
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
</html>`;

  const res = await sendEmail({
    to: [email],
    subject,
    html,
    from: process.env.FROM_EMAIL!,
    replyTo: process.env.REPLY_TO_EMAIL || '',
  });

  if (!res.success) {
    console.error('Failed to send suspension email:', res.error);
  }

  return res;
}
