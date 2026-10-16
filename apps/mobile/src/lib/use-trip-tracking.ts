import { trackingDecision, type TrackingDecision, type TripStatus } from '@transport/shared';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import {
  flushLocations,
  hasTrackingPermission,
  startTripTracking,
  stopTripTracking,
  useQueuedPointCount,
} from './background-location';
import { useLocationConsent } from './location-consent';
import { supabase } from './supabase';

export interface TripTracking {
  /** null while the consent or the permission are being read. */
  decision: TrackingDecision | null;
  /** The OS could not start background updates on this phone. */
  unavailable: boolean;
  queuedPoints: number;
}

/**
 * Starts and stops the background GPS from the trip the operator sees (B22).
 * `trip` is undefined while it is unknown (loading, load error): tracking is
 * left as it is. null (no trip) or a status outside an active trip stops it,
 * so registering the delivery ends tracking; then the queue is sent.
 */
export function useTripTracking(
  userId: string | null,
  trip: { id: string; status: TripStatus } | null | undefined,
): TripTracking {
  const consent = useLocationConsent(supabase, userId);
  const [permission, setPermission] = useState<boolean | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const queuedPoints = useQueuedPointCount(userId);

  // The operator may change the permission in the settings at any time.
  useEffect(() => {
    const check = () => {
      void hasTrackingPermission()
        .then(setPermission)
        .catch(() => setPermission(false));
    };
    check();
    const subscription = AppState.addEventListener('change', (appState) => {
      if (appState === 'active') {
        check();
        void flushLocations();
      }
    });
    return () => subscription.remove();
  }, []);

  const decision =
    trip === undefined || consent.status === 'loading' || permission === null
      ? null
      : trackingDecision({
          status: trip?.status ?? null,
          consented: consent.status === 'given',
          backgroundPermission: permission,
        });
  const tripId = trip?.id ?? null;

  useEffect(() => {
    if (!userId || decision === null) return;
    let cancelled = false;
    if (decision === 'track' && tripId) {
      void startTripTracking(userId, tripId).then((result) => {
        if (cancelled) return;
        setUnavailable(result === 'unavailable');
        if (result === 'needs_permission') setPermission(false);
      });
    } else {
      // Points recorded before the stop are still sent (the server takes them
      // up to the delivery time).
      void stopTripTracking()
        .then(() => flushLocations())
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [decision, tripId, userId]);

  return { decision, unavailable, queuedPoints };
}
