import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { updateSession } from './utils/supabase/middleware';

const SESSION_COOKIE_NAME = 'ghazal_session';

export default async function proxy(request: NextRequest) {
  const startMs = Date.now();
  try {
    // Update Supabase session and get the base response with potentially refreshed cookies
    const supabaseResponse = await updateSession(request);

    const { pathname } = request.nextUrl;
    const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value || request.cookies.get('dahab_session')?.value;
    const roleCookie = request.cookies.get('ghazal_role')?.value || request.cookies.get('dahab_role')?.value;

    const isAdminRoute = pathname.startsWith('/admin') && !pathname.startsWith('/admin/login');
    const isPosRoute = pathname.startsWith('/pos') && !pathname.startsWith('/pos/login') && !pathname.startsWith('/pos/download');

    let finalResponse = supabaseResponse || NextResponse.next({ request });

    function redirectWithCookies(url: URL) {
      if (url.hostname === '0.0.0.0') {
        const hostHeader = request.headers.get('host') || 'localhost:3000';
        const cleanHost = hostHeader.split(':')[0];
        url.hostname = cleanHost === '0.0.0.0' ? 'localhost' : cleanHost;
      }
      const res = NextResponse.redirect(url);
      // Copy cookies set by Supabase
      if (supabaseResponse?.cookies) {
        supabaseResponse.cookies.getAll().forEach(cookie => {
          res.cookies.set(cookie.name, cookie.value);
        });
      }
      return res;
    }

    // 2. Absolute POS Cashier Isolation (P2-002)
    const isCashierRole = roleCookie?.toUpperCase() === 'CASHIER' || sessionToken?.startsWith('ghazal_cashier_');
    if (isAdminRoute && isCashierRole) {
      // Cashiers are completely isolated to /pos
      return redirectWithCookies(new URL('/pos/cashier', request.url));
    }

    // Early routing check: if accessing protected routes without a cookie, redirect immediately.
    if (isAdminRoute && !sessionToken) {
      return redirectWithCookies(new URL('/admin/login', request.url));
    }

    const isPairedTerminal = request.cookies.get('ghazal_pos_paired_device')?.value;
    const isCashierWorkspace = pathname === '/pos' || pathname === '/pos/cashier' || pathname.startsWith('/pos/cashier/');
    if (isPosRoute && !isCashierWorkspace && !sessionToken && !isPairedTerminal) {
      return redirectWithCookies(new URL('/pos/login', request.url));
    }

    // Locale handling logic
    const isPublicRoute = !pathname.startsWith('/admin') && !pathname.startsWith('/pos');
    if (isPublicRoute) {
      // Exempt static files, downloads, and files with extensions from locale prefixing
      if (
        pathname.startsWith('/downloads') || 
        pathname.startsWith('/api') || 
        pathname.endsWith('.exe') ||
        pathname.includes('.')
      ) {
        finalResponse.headers.set('X-Frame-Options', 'SAMEORIGIN');
        finalResponse.headers.set('X-Content-Type-Options', 'nosniff');
        finalResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
        finalResponse.headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');

        return finalResponse;
      }

      if (pathname === '/') {
        const url = new URL('/ar', request.url);
        url.search = request.nextUrl.search;
        return redirectWithCookies(url);
      }
      
      // If it doesn't start with /ar or /en, redirect to /ar/path
      const localeMatch = pathname.match(/^\/(ar|en)(\/|$)/);
      if (!localeMatch) {
        const url = new URL(`/ar${pathname}`, request.url);
        url.search = request.nextUrl.search;
        return redirectWithCookies(url);
      }
    }

    finalResponse.headers.set('X-Frame-Options', 'SAMEORIGIN');
    finalResponse.headers.set('X-Content-Type-Options', 'nosniff');
    finalResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    finalResponse.headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    finalResponse.headers.set('Server-Timing', `proxy;dur=${Date.now() - startMs}`);

    return finalResponse;
  } catch (err) {
    console.error('[Middleware Proxy Error]:', err);
    return NextResponse.next({ request });
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - downloads (POS download binaries)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - sitemap.xml (sitemap file)
     * - robots.txt (robots file)
     * - logo.png and any other static files
     */
    '/((?!api|downloads|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|site\\.webmanifest|manifest\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|exe|zip|msi|webmanifest|ico)$).*)',
  ],
};
