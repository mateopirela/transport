import {
  APP_LOCALE,
  authCopy,
  cargoTypeLabels,
  formatDateTime,
  isTripActive,
  loadStatusLabels,
  shareLinksCopy,
  specialRequirementLabels,
  tripEventTypeLabels,
  tripStatusLabels,
  unitTypeLabels,
  type PublicSharedLoad,
  type PublicSharedTrip,
} from '@transport/shared';
import Link from 'next/link';

import { PositionMap } from '@/components/share/position-map';
import { TripStatusBadge } from '@/components/trips/trip-status-badge';
import { paths } from '@/lib/routing';

const c = shareLinksCopy.public;
const number = new Intl.NumberFormat(APP_LOCALE, { maximumFractionDigits: 2 });

/** Frame of the public pages (G7): no session, no navigation, just the brand. */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="bg-navy px-4 py-5 text-navy-foreground sm:px-8">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <Link href={paths.home} className="font-serif text-xl">
            {authCopy.appName}
          </Link>
          <span className="text-xs text-navy-foreground/75">{c.sharedBy}</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-4 py-8 sm:px-8">
        {children}
      </main>
    </div>
  );
}

/** What a visitor sees for an unknown, expired or revoked link: all alike. */
export function ShareUnavailable() {
  return (
    <section className="space-y-2 rounded-xl border bg-card p-6">
      <h1 className="text-2xl">{c.unavailableTitle}</h1>
      <p className="text-muted-foreground">{c.unavailableBody}</p>
    </section>
  );
}

function Details({ rows }: { rows: [string, string | null][] }) {
  const details = rows.filter((row): row is [string, string] => row[1] !== null);
  return (
    <dl className="grid gap-x-6 gap-y-4 rounded-xl border bg-card p-6 sm:grid-cols-2">
      {details.map(([label, value]) => (
        <div key={label} className="space-y-1">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="text-sm">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const route = (doc: PublicSharedLoad | PublicSharedTrip) =>
  `${doc.origin.city} → ${doc.destination.city}`;
const places = (doc: PublicSharedLoad | PublicSharedTrip) =>
  `${doc.origin.city}, ${doc.origin.state} → ${doc.destination.city}, ${doc.destination.state}`;
const window = (w: { start: string; end: string }) =>
  c.window(formatDateTime(w.start), formatDateTime(w.end));

/** A shared load: route by city, windows, cargo type, weight, unit and requirements. */
export function SharedLoad({ data }: { data: PublicSharedLoad }) {
  return (
    <>
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">{c.title.load}</p>
        <h1 className="text-3xl sm:text-4xl">{route(data)}</h1>
        <p className="text-muted-foreground">{places(data)}</p>
      </div>
      <Details
        rows={[
          [c.status, loadStatusLabels[data.status]],
          [c.pickup, window(data.pickupWindow)],
          [c.delivery, window(data.deliveryWindow)],
          [c.cargoType, cargoTypeLabels[data.cargoType]],
          [c.weight, c.weightValue(number.format(data.weightKg))],
          [c.unitType, unitTypeLabels[data.unitType]],
          [
            c.requirements,
            data.specialRequirements.length === 0
              ? c.noRequirements
              : data.specialRequirements.map((r) => specialRequirementLabels[r]).join(', '),
          ],
        ]}
      />
      <p className="text-xs text-muted-foreground">{c.expires(formatDateTime(data.expiresAt))}</p>
    </>
  );
}

/** A shared tracking: status, carrier, masked unit, timeline and the last position while active. */
export function SharedTrip({ data }: { data: PublicSharedTrip }) {
  const active = isTripActive(data.status);
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{c.title.trip}</p>
          <h1 className="text-3xl sm:text-4xl">{route(data)}</h1>
          <p className="text-muted-foreground">{places(data)}</p>
        </div>
        <TripStatusBadge status={data.status} />
      </div>

      <section className="space-y-3">
        <h2 className="text-2xl">{c.position}</h2>
        {data.lastPosition ? (
          <>
            <PositionMap position={{ lat: data.lastPosition.lat, lng: data.lastPosition.lng }} />
            <p className="text-sm" role="status">
              {c.positionAt(formatDateTime(data.lastPosition.recordedAt))}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground" role="status">
            {active ? c.positionWaiting : c.positionUnavailable}
          </p>
        )}
        <p className="text-xs text-muted-foreground">{c.refreshes}</p>
      </section>

      <Details
        rows={[
          [c.status, tripStatusLabels[data.status]],
          [c.carrier, data.carrierName],
          [
            c.unit,
            data.plateMasked
              ? c.unitValue(data.unitType ? unitTypeLabels[data.unitType] : '', data.plateMasked)
              : c.notAssigned,
          ],
          [c.pickup, window(data.pickupWindow)],
          [c.delivery, window(data.deliveryWindow)],
          [
            c.unloadEstimate,
            data.estimatedUnloadEndAt ? formatDateTime(data.estimatedUnloadEndAt) : null,
          ],
        ]}
      />

      <section className="space-y-3">
        <h2 className="text-2xl">{c.timeline}</h2>
        {data.timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">{c.timelineEmpty}</p>
        ) : (
          <ol className="divide-y rounded-xl border bg-card">
            {data.timeline.map((event, index) => (
              <li
                key={`${event.type}-${event.occurredAt}-${index}`}
                className="flex flex-wrap items-baseline justify-between gap-2 p-4 text-sm"
              >
                <p className="font-medium">{tripEventTypeLabels[event.type]}</p>
                <time className="text-xs text-muted-foreground" dateTime={event.occurredAt}>
                  {formatDateTime(event.occurredAt)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>
      <p className="text-xs text-muted-foreground">{c.expires(formatDateTime(data.expiresAt))}</p>
    </>
  );
}
