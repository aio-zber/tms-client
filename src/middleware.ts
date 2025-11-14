/**
 * Next.js Middleware - Simplified
 * Redirects protected routes to root page for SSO handling
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware function - runs on every request
 */
export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Skip middleware for Next.js internal routes and API routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/auth/callback') || // Let callback page handle token
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Define protected routes
  const isProtectedRoute =
    pathname.startsWith('/chats') ||
    pathname.startsWith('/calls') ||
    pathname.startsWith('/settings');

  // For protected routes, check if user has TMS auth token
  // If not, redirect to root page which will handle SSO flow
  if (isProtectedRoute) {
    // Redirect to root page - it will handle SSO authentication
    // Root page will check for TMS auth, and if missing, initiate GCGC SSO
    return NextResponse.redirect(new URL('/', request.url));
  }

  // For root page and other routes, continue normally
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
