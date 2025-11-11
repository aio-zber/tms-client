/**
 * Next.js Middleware for SSO Cookie Detection
 * Detects GCGC NextAuth session cookies and manages authentication flow
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Extract GCGC NextAuth session token from request cookies.
 */
function extractGCGCToken(request: NextRequest): string | null {
  // Common NextAuth cookie names
  const tokenNames = [
    'next-auth.session-token',
    '__Secure-next-auth.session-token',
    '__Host-next-auth.session-token',
    'authjs.session-token',
    '__Secure-authjs.session-token',
  ];

  for (const name of tokenNames) {
    const token = request.cookies.get(name);
    if (token?.value) {
      return token.value;
    }
  }

  return null;
}

/**
 * Middleware function - runs on every request
 */
export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Skip middleware for Next.js internal routes and API routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Check for GCGC NextAuth session cookie
  const gcgcToken = extractGCGCToken(request);

  // Define route types
  const isAuthRoute = pathname.startsWith('/login');
  const isProtectedRoute =
    pathname.startsWith('/chats') ||
    pathname.startsWith('/calls') ||
    pathname.startsWith('/settings');

  // If user has GCGC session and tries to access login page
  if (gcgcToken && isAuthRoute) {
    console.log('🔐 SSO: GCGC session detected, redirecting from login to app');
    // User is already logged into GCGC, redirect to app
    return NextResponse.redirect(new URL('/', request.url));
  }

  // If user tries to access protected route without GCGC session
  if (!gcgcToken && isProtectedRoute) {
    console.log('🔐 SSO: No GCGC session, redirecting to GCGC login');
    // No GCGC session, redirect to GCGC login page
    const gcgcLoginUrl = process.env.NEXT_PUBLIC_GCGC_LOGIN_URL ||
                         'https://gcgc-team-management-system-staging.up.railway.app/auth/signin';
    const returnUrl = encodeURIComponent(request.url);
    return NextResponse.redirect(`${gcgcLoginUrl}?callbackUrl=${returnUrl}`);
  }

  // For root page, let it handle SSO auto-login logic
  // For other routes, continue normally
  return NextResponse.next();
}

/**
 * Configure which paths this middleware should run on
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, fonts, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*|api).*)',
  ],
};
