/**
 * Throwaway smoke test for the SESv2 migration in lib/ses.ts.
 *
 *   npx tsx --env-file=.env scripts/ses-v2-smoke.ts [recipient@example.com]
 *
 * Sends exactly one real email through sendEmail() and prints the SES MessageId
 * so it can be correlated against the events landing on SQS. Delete once the
 * migration is verified.
 */
import { sendEmail } from '../lib/ses';

const to = process.argv[2] || process.env.FROM_EMAIL;

async function main() {
  if (!to) {
    console.error('No recipient: pass one as argv[2] or set FROM_EMAIL.');
    process.exit(1);
  }
  if (!process.env.FROM_EMAIL) {
    console.error('FROM_EMAIL is not set — sendEmail() has no default sender.');
    process.exit(1);
  }

  console.log('region           :', process.env.AWS_REGION);
  console.log('configurationSet :', process.env.AWS_SES_CONFIGURATION_SET);
  console.log('from             :', process.env.FROM_EMAIL);
  console.log('to               :', to);
  console.log('---');

  const startedAt = Date.now();
  const result = await sendEmail({
    to: [to],
    subject: 'mailpackr SESv2 smoke test',
    html: '<p>Verifying that lib/ses.ts sends through the SESv2 API.</p>',
    from: process.env.FROM_EMAIL,
    campaignId: 'smoke-test',
  });
  const elapsed = Date.now() - startedAt;

  console.log(JSON.stringify(result, null, 2));
  console.log(`--- ${elapsed}ms`);

  if (!result.success) process.exit(1);
  if (!result.sesMessageId) {
    console.error('Sent, but no MessageId came back — unexpected for SESv2.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Threw instead of returning a structured error:', err);
  process.exit(1);
});
