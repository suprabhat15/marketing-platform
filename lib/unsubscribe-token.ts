import { createHmac, timingSafeEqual } from 'crypto';

function getSecret(): string {
  const secret = process.env.UNSUBSCRIBE_TOKEN_SECRET;
  if (!secret) throw new Error('UNSUBSCRIBE_TOKEN_SECRET env var is not set');
  return secret;
}

export function signUnsubscribeToken(sid: string, cid: string): string {
  return createHmac('sha256', getSecret()).update(`${sid}:${cid}`).digest('hex');
}

export function verifyUnsubscribeToken(sid: string, cid: string, token: string): boolean {
  try {
    const expected = Buffer.from(signUnsubscribeToken(sid, cid), 'hex');
    const actual = Buffer.from(token, 'hex');
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
