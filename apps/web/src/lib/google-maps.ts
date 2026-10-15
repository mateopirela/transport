// Browser-only loader for the Google Maps JavaScript API (Places Autocomplete
// and the route preview). The key is public by design (restricted by HTTP
// referrer in Google Cloud). Without a key, callers show a fallback.

/** The browser key, or null when Maps is not configured. */
export function googleMapsKey(): string | null {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || null;
}

/** Map ID for vector maps and advanced markers; Google's demo ID works in development. */
export function googleMapId(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';
}

const CALLBACK = '__transportGoogleMapsReady';
let loading: Promise<void> | null = null;

/** Loads the Maps script once per page; a failed load can be retried. */
export function loadGoogleMaps(key: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Maps needs a browser'));
  if (typeof google !== 'undefined' && 'importLibrary' in google.maps) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const params = new URLSearchParams({
      key,
      v: 'weekly',
      loading: 'async',
      language: 'es',
      region: 'MX',
      callback: CALLBACK,
    });
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    (window as unknown as Record<string, () => void>)[CALLBACK] = () => resolve();
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error('Google Maps failed to load'));
    };
    document.head.append(script);
  });
  return loading;
}
