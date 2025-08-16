import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';
  const pathname = request.nextUrl.pathname;

  // Allow static files and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.includes('.') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  // Check if this is the main domain (domain.com) or app subdomain (app.domain.com)
  const isAppDomain = host.startsWith('app.');
  const isMainDomain = !isAppDomain;
  
  // Define which pages belong to which domain
  const landingPages = ['/', '/terms', '/privacy'];
  const appPages = ['/campaigns', '/lists', '/templates', '/subscribers', '/dashboard'];

  // Main domain (domain.com) - serve landing pages only
  if (isMainDomain) {
    // Allow landing pages on main domain
    if (landingPages.includes(pathname)) {
      return NextResponse.next();
    }
    
    // Allow auth page on main domain (for login/signup)
    if (pathname === '/auth') {
      return NextResponse.next();
    }
    
    // Redirect app pages to app subdomain
    if (appPages.some(path => pathname.startsWith(path))) {
      const appUrl = `https://app.${host}${pathname}`;
      return NextResponse.redirect(appUrl);
    }
    
    // Allow API routes (needed for auth)
    if (pathname.startsWith('/api/')) {
      return NextResponse.next();
    }
    
    // Default: redirect unknown routes to landing page
    return NextResponse.redirect(new URL('/', request.url));
  }

  // App domain (app.domain.com) - serve app pages only
  if (isAppDomain) {
    // Redirect landing pages to main domain
    if (landingPages.includes(pathname) && pathname !== '/') {
      const baseDomain = host.replace('app.', '');
      const mainUrl = `https://${baseDomain}${pathname}`;
      return NextResponse.redirect(mainUrl);
    }
    
    // Allow auth page on app domain (for redirects after login)
    if (pathname === '/auth') {
      return NextResponse.next();
    }
    
    // Allow app pages
    if (appPages.some(path => pathname.startsWith(path))) {
      return NextResponse.next();
    }
    
    // Allow API routes
    if (pathname.startsWith('/api/')) {
      return NextResponse.next();
    }
  }

  // Allow everything else to pass through
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};