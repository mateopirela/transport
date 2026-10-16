'use client';

import { estimateRoadKm, formatDistance, loadsCopy, type LatLng } from '@transport/shared';
import { useEffect, useRef, useState } from 'react';

import { googleMapId, googleMapsKey, loadGoogleMaps } from '@/lib/google-maps';

const c = loadsCopy.map;

export interface RoutePoint extends LatLng {
  label: string;
}

/**
 * Route preview: origin and destination on a Google map, joined by a
 * geodesic line, with the estimated road distance (haversine × factor; real
 * road distances come with Routes in B08). Without a key, or if Maps fails,
 * a simple diagram replaces the map.
 */
export function RouteMap({
  origin,
  destination,
  roadFactor,
}: {
  origin: RoutePoint | null;
  destination: RoutePoint | null;
  roadFactor: number;
}) {
  const key = googleMapsKey();
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [failed, setFailed] = useState(false);
  const ready = origin !== null && destination !== null;

  // One map per screen (each map load is billed), created once the route exists.
  useEffect(() => {
    if (!key || !ready || map) return;
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
  }, [key, ready, map]);

  const [oLat, oLng, oLabel] = [origin?.lat, origin?.lng, origin?.label];
  const [dLat, dLng, dLabel] = [destination?.lat, destination?.lng, destination?.label];
  useEffect(() => {
    if (!map || oLat === undefined || oLng === undefined) return;
    if (dLat === undefined || dLng === undefined) return;
    let cancelled = false;
    const cleanup: (() => void)[] = [];
    google.maps
      .importLibrary('marker')
      .then(({ AdvancedMarkerElement }) => {
        if (cancelled) return;
        const from = { lat: oLat, lng: oLng };
        const to = { lat: dLat, lng: dLng };
        for (const [position, title] of [
          [from, oLabel],
          [to, dLabel],
        ] as const) {
          const marker = new AdvancedMarkerElement({ map, position, title });
          cleanup.push(() => (marker.map = null));
        }
        const line = new google.maps.Polyline({
          map,
          path: [from, to],
          geodesic: true,
          strokeColor: '#2f6fe4',
          strokeWeight: 4,
        });
        cleanup.push(() => line.setMap(null));
        map.fitBounds(new google.maps.LatLngBounds(from).extend(to), 48);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      for (const fn of cleanup) fn();
    };
  }, [map, oLat, oLng, oLabel, dLat, dLng, dLabel]);

  const showMap = Boolean(key) && !failed && ready;
  return (
    <div className="space-y-2">
      <div className="relative h-64 overflow-hidden rounded-lg border bg-muted">
        <div ref={container} className="absolute inset-0" hidden={!showMap} />
        {!showMap && <RouteDiagram origin={origin} destination={destination} />}
      </div>
      {ready && (
        <p className="text-sm">
          {c.estimate(formatDistance(estimateRoadKm(origin, destination, roadFactor)))}{' '}
          <span className="text-muted-foreground">{c.estimateHint}</span>
        </p>
      )}
    </div>
  );
}

/**
 * Map placeholder: both points placed by their coordinates, joined by a
 * dashed line, plus the unit's trail and last point when given (B15).
 */
export function RouteDiagram({
  origin,
  destination,
  trail = [],
  caption = c.unavailable,
}: {
  origin: RoutePoint | null;
  destination: RoutePoint | null;
  trail?: readonly LatLng[];
  caption?: string;
}) {
  if (!origin || !destination) {
    return (
      <p className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        {c.pickPlaces}
      </p>
    );
  }
  // Project every point (route and trail) into a 100×60 box with a margin,
  // keeping north up and the aspect.
  const points = [origin, destination, ...trail];
  const lngs = points.map((p) => p.lng);
  const lats = points.map((p) => p.lat);
  const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)];
  const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)];
  const span = Math.max(maxLng - minLng, maxLat - minLat, 0.01);
  const midLng = (minLng + maxLng) / 2;
  const midLat = (minLat + maxLat) / 2;
  const project = (p: LatLng) => ({
    x: 50 + ((p.lng - midLng) / span) * 70,
    y: 30 - ((p.lat - midLat) / span) * 42,
  });
  const a = project(origin);
  const b = project(destination);
  const path = trail.map(project);
  const last = path.at(-1);
  return (
    <figure className="flex h-full flex-col">
      <svg viewBox="0 0 100 60" className="flex-1" role="img" aria-label={caption}>
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          className="stroke-accent"
          strokeWidth="0.8"
          strokeDasharray="2 1.5"
        />
        {path.length > 1 && (
          <polyline
            points={path.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            className="stroke-navy"
            strokeWidth="0.9"
          />
        )}
        {[
          { point: a, label: origin.label },
          { point: b, label: destination.label },
        ].map(({ point, label }, index) => (
          <g key={index}>
            <circle cx={point.x} cy={point.y} r="1.8" className="fill-navy" />
            <text
              x={point.x}
              y={point.y - 3}
              textAnchor="middle"
              fontSize="3.2"
              className="fill-foreground"
            >
              {label}
            </text>
          </g>
        ))}
        {last && <circle cx={last.x} cy={last.y} r="2" className="fill-accent" />}
      </svg>
      <figcaption className="pb-2 text-center text-xs text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}
