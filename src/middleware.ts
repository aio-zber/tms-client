/**
 * Next.js Middleware - Minimal
 * Only handles static file optimization, auth handled client-side
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware function - runs on every request
 * Authentication is handled client-side in page components since
 * middleware cannot access localStorage
 */
export function middleware() {
  // Let all requests through - authentication is handled client-side
  // Each protected page component checks for auth token and redirects if needed
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
