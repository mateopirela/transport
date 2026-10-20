'use client';

import { clientTripsCopy, type LatLng } from '@transport/shared';
import { useEffect, useRef, useState } from 'react';

import { RouteDiagram, type RoutePoint } from '@/components/loads/route-map';
import { googleMapId, googleMapsKey, loadGoogleMaps } from '@/lib/google-maps';
import { mapColors } from '@/lib/map-colors';

const c = clientTripsCopy.map;

/**
 * Trip map: origin, destination, the unit's trail and its last point. The
 * page re-renders with new points while the trip is active (polling), so this
 * only redraws the overlays and keeps the user's zoom after the first fit.
 * Without a Maps key, or if Maps fails, the diagram placeholder is shown.
 */
export function TripMap({
  origin,
  destination,
  trail,
}: {
  origin: RoutePoint;
  destination: RoutePoint;
  trail: readonly LatLng[];
}) {
  const key = googleMapsKey();
  const container = useRef<HTMLDivElement>(null);
  const fitted = useRef(false);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!key || map) return;
    let cancelled = false;
    loadGoogleMaps(key)
      .then(() => google.maps.importLibrary('maps'))
      .then(({ Map }) => {
        if (cancelled || !container.current) return;
        setMap(
          new Map(container.current, {
            mapId: googleMapId(),
            disableDefaultUI: true,
            zoomControl: true,
            gestureHandling: 'cooperative',
          }),
        );
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [key, map]);

  useEffect(() => {
    if (!map) return;
    let cancelled = false;
    const cleanup: (() => void)[] = [];
    google.maps
      .importLibrary('marker')
      .then(({ AdvancedMarkerElement, PinElement }) => {
        if (cancelled) return;
        for (const point of [origin, destination]) {
          const marker = new AdvancedMarkerElement({ map, position: point, title: point.label });
          cleanup.push(() => (marker.map = null));
        }
        const bounds = new google.maps.LatLngBounds(origin).extend(destination);
        // The whole recorded path is visible on the first fit.
        for (const point of trail) bounds.extend(point);
        if (trail.length > 1) {
          const line = new google.maps.Polyline({
            map,
            path: [...trail],
            strokeColor: mapColors.trail,
            strokeWeight: 4,
          });
          cleanup.push(() => line.setMap(null));
        }
        const last = trail.at(-1);
        if (last) {
          const pin = new PinElement({
            background: mapColors.pin,
            borderColor: mapColors.pinBorder,
            glyphColor: mapColors.pinGlyph,
          });
          const marker = new AdvancedMarkerElement({
            map,
            position: last,
            title: c.lastPoint,
            content: pin.element,
          });
          cleanup.push(() => (marker.map = null));
        }
        if (!fitted.current) {
          map.fitBounds(bounds, 48);
          fitted.current = true;
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      for (const fn of cleanup) fn();
    };
  }, [map, origin, destination, trail]);

  const showMap = Boolean(key) && !failed;
  return (
    <div className="relative h-72 overflow-hidden rounded-2xl border bg-surface-high lg:h-96">
      <div ref={container} className="absolute inset-0" hidden={!showMap} />
      {!showMap && (
        <RouteDiagram
          origin={origin}
          destination={destination}
          trail={trail}
          caption={c.unavailable}
        />
      )}
    </div>
  );
}
