import { useCallback, useMemo } from 'react';

import { useSession } from '../providers/session';
import { supabase, type Supabase } from './supabase';
import { useLoader } from './use-loader';

export interface CarrierContext {
  client: Supabase;
  companyId: string;
  companyName: string;
}

/**
 * The client and company of the signed-in carrier, or null while the session
 * changes (e.g. during sign-out, before the router leaves the carrier area).
 * Stable between renders while the company does not change.
 */
export function useCarrier(): CarrierContext | null {
  const { profile } = useSession();
  const companyId = profile?.role === 'carrier' ? profile.companyId : null;
  const companyName = profile?.companyName ?? '';
  return useMemo(
    () => (supabase && companyId ? { client: supabase, companyId, companyName } : null),
    [companyId, companyName],
  );
}

/**
 * Loads data of the signed-in carrier on focus (see useLoader). `load` must be
 * stable (useCallback or module level); it stays loading while there is no
 * carrier.
 */
export function useCarrierData<T>(load: (carrier: CarrierContext) => Promise<T>) {
  const carrier = useCarrier();
  const run = useCallback(
    () => (carrier ? load(carrier) : new Promise<T>(() => undefined)),
    [carrier, load],
  );
  return { carrier, ...useLoader(run) };
}
