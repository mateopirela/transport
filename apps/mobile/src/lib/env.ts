// Public configuration of the app. Only EXPO_PUBLIC_* variables reach the
// bundle, so nothing secret may ever be read here: the Supabase anon key is
// public by design and authorization lives in Postgres (RLS + RPCs).

export interface MobileEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** EAS project id; without it there are no push tokens (degraded mode). */
  easProjectId: string | null;
}

export type MobileEnvResult = { ok: true; env: MobileEnv } | { ok: false; problems: string[] };

export interface MobileEnvSource {
  EXPO_PUBLIC_SUPABASE_URL?: string | undefined;
  EXPO_PUBLIC_SUPABASE_ANON_KEY?: string | undefined;
  EXPO_PUBLIC_EAS_PROJECT_ID?: string | undefined;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '10.0.2.2']);

/** True for loopback hosts and private LAN addresses used during development. */
function isLocalHost(hostname: string): boolean {
  return (
    LOCAL_HOSTS.has(hostname) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/u.test(hostname) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/u.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/u.test(hostname)
  );
}

/**
 * Validates the public configuration. Plain `http` is accepted only for local
 * development hosts and only when `allowInsecureLocal` is set (dev builds), so
 * a release build can never send credentials over cleartext.
 */
export function readMobileEnv(
  source: MobileEnvSource,
  { allowInsecureLocal }: { allowInsecureLocal: boolean },
): MobileEnvResult {
  const problems: string[] = [];
  const supabaseUrl = source.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
  const supabaseAnonKey = source.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';
  const easProjectId = source.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() || null;

  if (!supabaseUrl) {
    problems.push('EXPO_PUBLIC_SUPABASE_URL is missing');
  } else {
    let url: URL | null = null;
    try {
      url = new URL(supabaseUrl);
    } catch {
      problems.push('EXPO_PUBLIC_SUPABASE_URL is not a valid URL');
    }
    if (url) {
      const secure = url.protocol === 'https:';
      const localDev = url.protocol === 'http:' && allowInsecureLocal && isLocalHost(url.hostname);
      if (!secure && !localDev) {
        problems.push('EXPO_PUBLIC_SUPABASE_URL must use https outside local development');
      }
    }
  }
  if (!supabaseAnonKey) problems.push('EXPO_PUBLIC_SUPABASE_ANON_KEY is missing');

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    env: { supabaseUrl: supabaseUrl.replace(/\/+$/u, ''), supabaseAnonKey, easProjectId },
  };
}
