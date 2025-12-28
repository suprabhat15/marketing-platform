import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATH_PREFIXES = [
  '/auth', // Covers /auth/login, /auth/register, /auth/callback
  '/pricing',
  '/privacy',
  '/terms',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. ASSET BYPASS: Ignore Next.js internals and static assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/logo.svg' ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // 2. CHECK SESSION
  const sessionToken = request.cookies.get(
    '__Secure-better-auth.session_token'
  )?.value;

  // 3. DEFINE PATH TYPES
  const isPublicPath = PUBLIC_PATH_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );
  const isRootPath = pathname === '/';

  // 4. AUTHENTICATION LOGIC

  // CASE: User is NOT logged in
  if (!sessionToken) {
    // Allow public paths and the landing page (root)
    if (isPublicPath || isRootPath) {
      return NextResponse.next();
    }

    // Protect everything else -> Redirect to Login
    const url = request.nextUrl.clone();
    url.pathname = '/auth';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (sessionToken) {
    if (isRootPath || pathname.startsWith('/auth')) {
      return NextResponse.redirect(new URL('/campaigns', request.url));
    }
  }

  // Allow access to protected pages (e.g. /campaigns, /billing)
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
