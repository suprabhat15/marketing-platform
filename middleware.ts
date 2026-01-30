import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// ---------- Redis (Edge-safe) ----------
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// ---------- Rate limiters (API ONLY) ----------
const authRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 m'),
  prefix: 'ratelimit:api:auth',
});

const billingRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 m'),
  prefix: 'ratelimit:api:billing',
});

// ---------- Constants ----------
const PUBLIC_PATH_PREFIXES = ['/auth', '/pricing', '/privacy', '/terms'];

const WEBHOOK_PATHS = ['/api/stripe/webhook', '/api/ses/webhook'];

// ---------- Utils ----------
function getIp(req: NextRequest): string {
  return req.headers.get('cf-connecting-ip') ?? req.ip ?? '127.0.0.1';
}

// Edge-safe hashing
async function hash(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ---------- Middleware ----------
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hostname = req.headers.get('host');

  // ---------- OPTIONS / Assets ----------
  if (
    req.method === 'OPTIONS' ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // ---------- Domain enforcement ----------
  const allowedDomain = process.env.ALLOWED_DOMAIN;
  const isProduction =
    process.env.NODE_ENV === 'production' &&
    process.env.NEXT_PUBLIC_IS_SANDBOX !== 'true';

  if (isProduction && allowedDomain && hostname) {
    const isAllowed =
      hostname === allowedDomain || hostname.endsWith(`.${allowedDomain}`);

    if (!isAllowed) {
      return new NextResponse('Access Denied', { status: 403 });
    }
  }

  // ---------- Webhook bypass ----------
  if (WEBHOOK_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  // ---------- Session ----------
  const SESSION_COOKIE =
    process.env.SESSION_COOKIE_NAME ?? '__Secure-better-auth.session_token';

  const sessionToken = req.cookies.get(SESSION_COOKIE)?.value;
  const ip = getIp(req);

  const identifier = sessionToken
    ? `session:${await hash(sessionToken)}`
    : `ip:${ip}`;

  // ---------- API Rate Limiting ----------
  let rateLimiter: Ratelimit | null = null;

  if (pathname.startsWith('/api/auth')) {
    rateLimiter = authRateLimiter;
  } else if (pathname.startsWith('/api/billing')) {
    rateLimiter = billingRateLimiter;
  }

  if (rateLimiter) {
    const { success, reset } = await rateLimiter.limit(identifier);

    if (!success) {
      return NextResponse.json(
        { error: 'Too Many Requests' },
        {
          status: 429,
          headers: {
            'retry-after': Math.max(
              0,
              Math.ceil((reset - Date.now()) / 1000)
            ).toString(),
          },
        }
      );
    }
  }

  // ---------- Auth Routing ----------
  const isPublicPath = PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p));
  const isRootPath = pathname === '/';

  if (!sessionToken && !isPublicPath && !isRootPath) {
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = req.nextUrl.clone();
    url.pathname = '/auth';
    url.searchParams.set('next', pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  if (
    sessionToken &&
    !pathname.startsWith('/api') &&
    (isRootPath || pathname.startsWith('/auth'))
  ) {
    return NextResponse.redirect(new URL('/campaigns', req.url));
  }

  return NextResponse.next();
}

// ---------- Matcher ----------
export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
