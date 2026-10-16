// Settings of the end-to-end suite. Everything targets the LOCAL stack
// (`supabase start` with the demo seed): only the anon key and the demo
// users' passwords are used, never the service role.

function read(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/** Web app under test (the Auth `site_url` of supabase/config.toml by default). */
export const baseURL = read('E2E_BASE_URL') ?? 'http://127.0.0.1:3000';

/** Mailpit (local SMTP inbox of `supabase start`), to read the confirmation email. */
export const mailpitURL = read('E2E_MAILPIT_URL') ?? 'http://127.0.0.1:54324';

/** Supabase API and anon key: the same ones the web app is built with. */
export function supabaseSettings(): { url: string; anonKey: string } {
  const url = read('NEXT_PUBLIC_SUPABASE_URL') ?? read('SUPABASE_URL');
  const anonKey = read('NEXT_PUBLIC_SUPABASE_ANON_KEY') ?? read('SUPABASE_ANON_KEY');
  if (!url || !anonKey) {
    throw new Error(
      'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see e2e/README.md).',
    );
  }
  return { url, anonKey };
}
