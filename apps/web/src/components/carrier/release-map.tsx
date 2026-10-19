'use client';

import { clientTripsCopy, type LatLng } from '@transport/shared';
import { useEffect, useRef, useState } from 'react';

import { RouteDiagram, type RoutePoint } from '@/components/loads/route-map';
import { googleMapId, googleMapsKey, loadGoogleMaps } from '@/lib/google-maps';

const m = clientTripsCopy.map;

/**
 * Map of the release form (G5): the route of the cancelled trip, the unit's
 * last known point and, once the carrier clicks the map, the point they
 * picked. Without a Maps key, or if Maps fails, the route diagram is shown
 * and `onReady(false)` tells the form to hide "a point on the map".
 */
export function ReleaseMap({
  origin,
  destination,
  last,
  picked,
  onPick,
  onReady,
}: {
  origin: RoutePoint;
  destination: RoutePoint;
  last: LatLng | null;
  picked: LatLng | null;
  onPick: (point: LatLng) => void;
  onReady: (ready: boolean) => void;
}) {
  const key = googleMapsKey();
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [failed, setFailed] = useState(false);
  const pickedMarker = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);

  useEffect(() => {
    if (!key) {
      onReady(false);
      return;
    }
    if (map) return;
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
            draggableCursor: 'crosshair',
          }),
        );
        onReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        onReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key, map, onReady]);

  // The route, the last point and the click handler, once.
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
        if (last) {
          bounds.extend(last);
          const pin = new PinElement({
            background: '#2f6fe4',
            borderColor: '#13294b',
            glyphColor: '#ffffff',
          });
          const marker = new AdvancedMarkerElement({
            map,
            position: last,
            title: m.lastPoint,
            content: pin.element,
          });
          cleanup.push(() => (marker.map = null));
        }
        map.fitBounds(bounds, 48);
        const listener = map.addListener('click', (event: google.maps.MapMouseEvent) => {
          const at = event.latLng;
          if (at) onPick({ lat: at.lat(), lng: at.lng() });
        });
        cleanup.push(() => listener.remove());
      })
      .catch(() => {
        if (cancelled) return;
        // Without markers no point can be picked: the form must not offer it.
        setFailed(true);
        onReady(false);
      });
    return () => {
      cancelled = true;
      for (const fn of cleanup) fn();
    };
  }, [map, origin, destination, last, onPick, onReady]);

  // The picked point follows the clicks.
  useEffect(() => {
    if (!map) return;
    let cancelled = false;
    google.maps
      .importLibrary('marker')
      .then(({ AdvancedMarkerElement }) => {
        if (cancelled) return;
        if (!picked) {
          if (pickedMarker.current) pickedMarker.current.map = null;
          return;
        }
        pickedMarker.current ??= new AdvancedMarkerElement({ map });
        pickedMarker.current.map = map;
        pickedMarker.current.position = picked;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [map, picked]);

  const showMap = Boolean(key) && !failed;
  return (
    <div className="relative h-72 overflow-hidden rounded-lg border bg-muted">
      <div ref={container} className="absolute inset-0" hidden={!showMap} />
      {!showMap && (
        <RouteDiagram
          origin={origin}
          destination={destination}
          trail={last ? [last] : []}
          caption={m.unavailable}
        />
      )}
    </div>
  );
}
