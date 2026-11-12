import {
  APP_LOCALE,
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
import { Link2Off } from 'lucide-react';

import { PublicHeader } from '@/components/public-header';
import { PositionMap } from '@/components/share/position-map';
import { TripStatusBadge } from '@/components/trips/trip-status-badge';
import { ValueRow } from '@/components/ui/cell';
import { Group } from '@/components/ui/group';
import { Notice } from '@/components/ui/notice';
import { Pill } from '@/components/ui/pill';
import { Steps } from '@/components/ui/steps';
import { loadStatusTone } from '@/lib/status-tones';

const c = shareLinksCopy.public;
const number = new Intl.NumberFormat(APP_LOCALE, { maximumFractionDigits: 2 });

/**
 * Frame of the public pages (G7): no session, no navigation, just the brand
 * bar on Night (docs/plan-fulmis.md §2 V5) and who shared the page.
 */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader>
        <span className="text-footnote text-brand-text-dim">{c.sharedBy}</span>
      </PublicHeader>
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-10 px-4 py-8 sm:px-6 sm:py-12">
        {children}
      </main>
    </div>
  );
}

/** What a visitor sees for an unknown, expired or revoked link: all alike. */
export function ShareUnavailable() {
  return (
    <section className="flex flex-col items-center gap-1.5 border bg-cell px-6 py-12 text-center">
      <Link2Off aria-hidden className="mb-2 size-6 text-text-dim" />
      <h1 className="text-title3 text-text">{c.unavailableTitle}</h1>
      <p className="max-w-sm text-subhead text-text-dim">{c.unavailableBody}</p>
    </section>
  );
}

/** The top of a shared page: what it is, the route, and where it is from and to. */
function Heading({
  kicker,
  title,
  status,
  places,
}: {
  kicker: string;
  title: string;
  status?: React.ReactNode;
  places: string;
}) {
  return (
    <div className="space-y-3 border-b pb-8">
      <p className="text-label text-text-dim">{kicker}</p>
      <h1 className="text-title1 text-text sm:text-large-title">{title}</h1>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {status}
        <p className="text-callout text-text-dim">{places}</p>
      </div>
    </div>
  );
}

/** A section of a shared page: its `label` and what goes under it. */
function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-label text-text-dim">{title}</h2>
      {children}
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
      <Heading
        kicker={c.title.load}
        title={route(data)}
        status={<Pill tone={loadStatusTone(data.status)}>{loadStatusLabels[data.status]}</Pill>}
        places={places(data)}
      />
      <Details
        rows={[
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
      <p className="text-footnote text-text-dim">{c.expires(formatDateTime(data.expiresAt))}</p>
    </>
  );
}

/**
 * A shared tracking: status, carrier, masked unit, the last position while
 * active, and the timeline as steps (each one done, with its time).
 */
export function SharedTrip({ data }: { data: PublicSharedTrip }) {
  const active = isTripActive(data.status);
  return (
    <>
      <Heading
        kicker={c.title.trip}
        title={route(data)}
        status={<TripStatusBadge status={data.status} />}
        places={places(data)}
      />

      <Part title={c.position}>
        {data.lastPosition ? (
          <>
            <PositionMap position={{ lat: data.lastPosition.lat, lng: data.lastPosition.lng }} />
            <p className="text-subhead text-text" role="status">
              {c.positionAt(formatDateTime(data.lastPosition.recordedAt))}
            </p>
          </>
        ) : (
          <Notice tone="info">{active ? c.positionWaiting : c.positionUnavailable}</Notice>
        )}
        <p className="text-footnote text-text-dim">{c.refreshes}</p>
      </Part>

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

      <Part title={c.timeline}>
        {data.timeline.length === 0 ? (
          <Notice tone="info">{c.timelineEmpty}</Notice>
        ) : (
          <div className="border bg-cell px-5 py-5">
            <Steps
              label={c.timeline}
              steps={data.timeline.map((event) => ({
                label: tripEventTypeLabels[event.type],
                meta: <time dateTime={event.occurredAt}>{formatDateTime(event.occurredAt)}</time>,
                state: 'done' as const,
              }))}
            />
          </div>
        )}
      </Part>
      <p className="text-footnote text-text-dim">{c.expires(formatDateTime(data.expiresAt))}</p>
    </>
  );
}
