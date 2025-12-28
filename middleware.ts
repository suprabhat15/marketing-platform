import { NextRequest, NextResponse, NextFetchEvent } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const authRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 m'), // login / register / reset
  prefix: 'ratelimit:auth',
  analytics: true,
});

const billingRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 m'), // user-initiated billing ops
  prefix: 'ratelimit:billing',
  analytics: true,
});

const PUBLIC_PATH_PREFIXES = [
  '/auth',
  '/api/auth', // login, register, callbacks
  '/pricing',
  '/privacy',
  '/terms',
];

// Cloudflare-safe IP detection
function getIp(request: NextRequest): string {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.ip ??
    '127.0.0.1'
  );
}

export async function middleware(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get('host');

  const allowedDomain = process.env.ALLOWED_DOMAIN;
  const isProduction =
    process.env.NODE_ENV === 'production' &&
    process.env.NEXT_PUBLIC_IS_SANDBOX !== 'true';

  if (isProduction && hostname !== allowedDomain) {
    if (hostname?.includes('railway.app')) {
      return new NextResponse('Access Denied: Please use the main domain.', {
        status: 403,
      });

      // OR Redirect them properly:
      // return NextResponse.redirect(`https://${allowedDomain}${pathname}`);
    }
  }
  // A. Asset Bypass
  if (
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname === '/logo.svg'
  ) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get(
    '__Secure-better-auth.session_token'
  )?.value;

  const ip = getIp(request);

  // IMPORTANT:
  // Middleware only distinguishes anonymous vs authenticated.
  // Fine-grained per-user limits belong inside API handlers.
  const identifier = sessionToken ? 'user:authenticated' : `ip:${ip}`;

  // Never rate-limit OAuth callbacks
  if (pathname.startsWith('/api/auth/callback')) {
    return NextResponse.next();
  }

  // Never rate-limit machine-to-machine webhooks (signature verified elsewhere)
  if (pathname.startsWith('/api') && pathname.includes('webhook')) {
    return NextResponse.next();
  }

  let rateLimiter: Ratelimit | null = null;

  if (pathname.startsWith('/auth') || pathname.startsWith('/api/auth')) {
    rateLimiter = authRateLimiter;
  } else if (
    pathname.startsWith('/billing') ||
    pathname.startsWith('/api/billing')
  ) {
    rateLimiter = billingRateLimiter;
  }

  if (rateLimiter) {
    const { success, pending, reset } = await rateLimiter.limit(identifier);

    event.waitUntil(pending);

    if (!success) {
      return new NextResponse(JSON.stringify({ error: 'Too Many Requests' }), {
        status: 429,
        headers: {
          'content-type': 'application/json',
          'retry-after': Math.ceil((reset - Date.now()) / 1000).toString(),
        },
      });
    }
  }

  const isPublicPath = PUBLIC_PATH_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );
  const isRootPath = pathname === '/';

  if (sessionToken) {
    if (
      (isRootPath || pathname.startsWith('/auth')) &&
      !pathname.startsWith('/api')
    ) {
      return NextResponse.redirect(new URL('/campaigns', request.url));
    }
  }

  if (!sessionToken) {
    if (!isPublicPath && !isRootPath) {
      if (pathname.startsWith('/api')) {
        return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        });
      }

      // Pages redirect to /auth
      const url = request.nextUrl.clone();
      url.pathname = '/auth';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
