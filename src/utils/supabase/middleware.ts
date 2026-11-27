import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  try {
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL || 
      !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')
    ) {
      return supabaseResponse;
    }

    // Only invoke Supabase auth API if an active Supabase auth cookie exists,
    // avoiding redundant outbound network subrequests (200-400ms) on anonymous storefront visits.
    const allCookies = request.cookies.getAll();
    const hasSupabaseAuthCookie = allCookies.some(c => 
      c.name.startsWith('sb-') || c.name.includes('auth-token')
    );

    if (!hasSupabaseAuthCookie) {
      return supabaseResponse;
    }

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
              supabaseResponse = NextResponse.next({
                request,
              });
              cookiesToSet.forEach(({ name, value, options }) =>
                supabaseResponse.cookies.set(name, value, options)
              );
            } catch {}
          },
        },
      }
    );

    // Refreshing the auth token safely
    await supabase.auth.getUser();
  } catch (err) {
    // Prevent unhandled rejection in middleware
    console.warn('[Supabase Middleware] Session update warning:', err);
  }

  return supabaseResponse;
}
