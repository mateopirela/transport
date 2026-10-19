'use client';

import { shareLinksCopy, type LatLng } from '@transport/shared';
import { useEffect, useRef, useState } from 'react';

import { googleMapId, googleMapsKey, loadGoogleMaps } from '@/lib/google-maps';

const c = shareLinksCopy.public;

/**
 * The last position of a shared trip (G7): a Google map centred on the point
 * when a Maps key is set, or a plain link to open it in a maps app. Only the
 * point is drawn: the public view never knows the pickup or delivery
 * addresses, so there is no route to show.
 */
export function PositionMap({ position }: { position: LatLng }) {
  const key = googleMapsKey();
  const container = useRef<HTMLDivElement>(null);
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
            center: position,
            zoom: 9,
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
    // The map is created once; the marker effect follows the position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);

  useEffect(() => {
    if (!map) return;
    let cancelled = false;
    let marker: google.maps.marker.AdvancedMarkerElement | null = null;
    google.maps
      .importLibrary('marker')
      .then(({ AdvancedMarkerElement, PinElement }) => {
        if (cancelled) return;
        const pin = new PinElement({
          background: '#2f6fe4',
          borderColor: '#13294b',
          glyphColor: '#ffffff',
        });
        marker = new AdvancedMarkerElement({
          map,
          position,
          title: c.position,
          content: pin.element,
        });
        map.panTo(position);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (marker) marker.map = null;
    };
  }, [map, position]);

  const showMap = Boolean(key) && !failed;
  const mapsHref = `https://www.google.com/maps?q=${position.lat},${position.lng}`;
  return (
    <div className="space-y-2">
      <div className="relative h-72 overflow-hidden rounded-lg border bg-muted">
        <div ref={container} className="absolute inset-0" hidden={!showMap} />
        {!showMap && (
          <p className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {c.mapUnavailable}
          </p>
        )}
      </div>
      <a
        href={mapsHref}
        target="_blank"
        rel="noreferrer noopener"
        className="text-sm text-accent hover:underline"
      >
        {c.openInMaps}
      </a>
    </div>
  );
}
