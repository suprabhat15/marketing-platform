import { NextRequest, NextResponse } from 'next/server';

const SUSPENSION_EXEMPT_PATHS = [
  '/api/auth',
  '/api/user/status',
  '/api/payments/webhooks',
];

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (
    pathname.startsWith('/_next') ||
    pathname.includes('.') ||
    pathname.startsWith('/logo')
  ) {
    return NextResponse.next();
  }

  if (
    pathname.startsWith('/api/') &&
    !SUSPENSION_EXEMPT_PATHS.some((p) => pathname.startsWith(p))
  ) {
    const sessionCookie =
      request.cookies.get('better-auth.session_token') ||
      request.cookies.get('__Secure-better-auth.session_token');
    if (sessionCookie) {
      try {
        const statusRes = await fetch(
          new URL('/api/user/status', request.url),
          { headers: { cookie: request.headers.get('cookie') || '' } }
        );

        if (statusRes.ok) {
          const data = await statusRes.json();
          if (data.suspended) {
            return NextResponse.json(
              {
                error: 'Account suspended',
                reason: data.suspendedReason,
              },
              { status: 403 }
            );
          }
        }
      } catch {
        // If status check fails, let the request through — routes still have auth
      }
    }
  }

  if (pathname === '/') {
    return NextResponse.redirect(new URL('/campaigns', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|logo.svg).*)',
  ],
};
