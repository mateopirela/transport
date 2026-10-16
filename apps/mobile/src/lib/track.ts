import type { ProductEvent } from '@transport/shared';

import { trackEvent } from './analytics';
import { supabase } from './supabase';

/**
 * Product event from a screen (B25), with the app's Supabase client. Fire
 * and forget: offline or failed events are dropped (they are analytics, not
 * domain data); in development the reason is printed.
 */
export function track(event: ProductEvent): void {
  if (!supabase) return;
  void trackEvent(supabase, event, (error) => {
    if (__DEV__) console.warn('[analytics]', event.name, error);
  });
}
