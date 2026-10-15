/**
 * Public Supabase settings (anon key only: the service role never reaches the
 * web app). Returns `null` when they are missing so the app can still render
 * and show a notice instead of crashing.
 */
export function supabaseEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

/** Public origin of the web app, used to build links in auth emails. */
export function siteUrl(requestOrigin: string | null): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  return (configured || requestOrigin || 'http://127.0.0.1:3000').replace(/\/+$/u, '');
}
