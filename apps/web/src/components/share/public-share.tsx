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

import { PAGE_CONTAINER } from '@/components/app-shell';
import { PositionMap } from '@/components/share/position-map';
import { TripStatusBadge } from '@/components/trips/trip-status-badge';
import { ValueRow } from '@/components/ui/cell';
import { Group } from '@/components/ui/group';
import { groupRow } from '@/components/ui/variants';
import { paths } from '@/lib/routing';
import { cn } from '@/lib/utils';

const c = shareLinksCopy.public;
const number = new Intl.NumberFormat(APP_LOCALE, { maximumFractionDigits: 2 });

/** Frame of the public pages (G7): no session, no navigation, just the brand. */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-glass-line bg-glass backdrop-blur-xl backdrop-saturate-150">
        <div
          className={cn(
            PAGE_CONTAINER,
            'flex min-h-14 max-w-3xl items-center justify-between gap-4 py-2',
          )}
        >
          <Link href={paths.home} className="text-headline text-text">
            {authCopy.appName}
          </Link>
          <span className="text-right text-footnote text-text-dim">{c.sharedBy}</span>
        </div>
      </header>
      <main className={cn(PAGE_CONTAINER, 'max-w-3xl flex-1 space-y-8 py-8 sm:py-10')}>
        {children}
      </main>
    </div>
  );
}

/** What a visitor sees for an unknown, expired or revoked link: all alike. */
export function ShareUnavailable() {
  return (
    <section className="flex flex-col items-center gap-1 rounded-2xl border bg-cell px-6 py-12 text-center">
      <h1 className="text-title3 text-text">{c.unavailableTitle}</h1>
      <p className="max-w-sm text-subhead text-text-dim">{c.unavailableBody}</p>
    </section>
  );
}

function Details({ rows, footer }: { rows: [string, string | null][]; footer?: string | null }) {
  const details = rows.filter((row): row is [string, string] => row[1] !== null);
  return (
    <Group footer={footer}>
      {details.map(([label, value]) => (
        <ValueRow key={label} label={label}>
          {value}
        </ValueRow>
      ))}
    </Group>
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
      <div className="space-y-1.5">
        <p className="text-label text-text-dim">{c.title.load}</p>
        <h1 className="text-title1 text-text sm:text-large-title">{route(data)}</h1>
        <p className="text-callout text-text-dim">{places(data)}</p>
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
      <p className="px-1 text-footnote text-text-dim">
        {c.expires(formatDateTime(data.expiresAt))}
      </p>
    </>
  );
}

/** A shared tracking: status, carrier, masked unit, timeline and the last position while active. */
export function SharedTrip({ data }: { data: PublicSharedTrip }) {
  const active = isTripActive(data.status);
  return (
    <>
      <div className="space-y-1.5">
        <p className="text-label text-text-dim">{c.title.trip}</p>
        <h1 className="text-title1 text-text sm:text-large-title">{route(data)}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <TripStatusBadge status={data.status} />
          <p className="text-callout text-text-dim">{places(data)}</p>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="px-1 text-title2 text-text">{c.position}</h2>
        {data.lastPosition ? (
          <>
            <PositionMap position={{ lat: data.lastPosition.lat, lng: data.lastPosition.lng }} />
            <p className="px-1 text-subhead text-text" role="status">
              {c.positionAt(formatDateTime(data.lastPosition.recordedAt))}
            </p>
          </>
        ) : (
          <p
            className="rounded-2xl border bg-cell px-4 py-3.5 text-subhead text-text-dim"
            role="status"
          >
            {active ? c.positionWaiting : c.positionUnavailable}
          </p>
        )}
        <p className="px-1 text-footnote text-text-dim">{c.refreshes}</p>
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
        footer={data.estimatedUnloadEndAt ? c.unloadEstimateHint : null}
      />

      <section className="space-y-3">
        <h2 className="px-1 text-title2 text-text">{c.timeline}</h2>
        {data.timeline.length === 0 ? (
          <p className="rounded-2xl border bg-cell px-4 py-3.5 text-subhead text-text-dim">
            {c.timelineEmpty}
          </p>
        ) : (
          <Group>
            <ol>
              {data.timeline.map((event, index) => (
                <li
                  key={`${event.type}-${event.occurredAt}-${index}`}
                  className={cn(
                    groupRow,
                    'flex min-h-12.5 flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-4 py-2.5',
                  )}
                >
                  <p className="text-body text-text">{tripEventTypeLabels[event.type]}</p>
                  <time
                    className="text-footnote text-text-dim tabular-nums"
                    dateTime={event.occurredAt}
                  >
                    {formatDateTime(event.occurredAt)}
                  </time>
                </li>
              ))}
            </ol>
          </Group>
        )}
      </section>
      <p className="px-1 text-footnote text-text-dim">
        {c.expires(formatDateTime(data.expiresAt))}
      </p>
    </>
  );
}
