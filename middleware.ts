import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Allow static files and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.includes('.') ||
    pathname.startsWith('/logo')
  ) {
    return NextResponse.next();
  }

  // Redirect root to campaigns dashboard for authenticated users
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/campaigns', request.url));
  }

  // Allow all other routes to pass through
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - logo.svg (logo file)
     */
    '/((?!_next/static|_next/image|logo.svg).*)',
  ],
};
