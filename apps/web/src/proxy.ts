import { createServerClient } from '@supabase/ssr';
import type { Database } from '@transport/shared';
import { NextResponse, type NextRequest } from 'next/server';

import { supabaseEnv } from './lib/env';
import { resolveRoute } from './lib/routing';
import { loadViewer, type ViewerDetails } from './lib/viewer';

/**
 * Refreshes the Supabase session cookies on every request and redirects
 * optimistically by role (protected routes, /admin only for admins). Pages
 * repeat the check with `requireAccess`; data access is enforced by RLS.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  let viewer: ViewerDetails | null = null;

  const env = supabaseEnv();
  if (env) {
    const supabase = createServerClient<Database>(env.url, env.anonKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
        },
      },
    });
    viewer = await loadViewer(supabase);
  }

  const target = resolveRoute(request.nextUrl.pathname, viewer);
  if (!target) return response;

  const redirect = NextResponse.redirect(new URL(target, request.url));
  // Keep any refreshed session cookies and their cache headers.
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  for (const key of ['cache-control', 'expires', 'pragma']) {
    const value = response.headers.get(key);
    if (value) redirect.headers.set(key, value);
  }
  return redirect;
}

export const config = {
  // Everything except static assets.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
