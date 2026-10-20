import {
  formatDateTime,
  formatMxn,
  offersCopy,
  offerStatusLabels,
  unitTypeLabels,
  vehicleKindLabels,
  type ProviderState,
  type VerificationStatus,
} from '@transport/shared';
import Link from 'next/link';

import { ProviderBadge } from '@/components/shared-documents/provider-status';
import { buttonVariants } from '@/components/ui/button';
import { Group } from '@/components/ui/group';
import { Pill } from '@/components/ui/pill';
import { groupRow } from '@/components/ui/variants';
import { formatDelta, type BoardRow, type BoardVehicle } from '@/lib/offers/board';
import { negotiationPath } from '@/lib/routing';
import { negotiationTone, verificationTone } from '@/lib/status-tones';
import { cn } from '@/lib/utils';

const c = offersCopy.board;
const number = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });

/** Carrier verification status (companies, B03), as the shipper sees it. */
export function VerificationBadge({ status }: { status: VerificationStatus }) {
  return <Pill tone={verificationTone(status)}>{offersCopy.verification[status]}</Pill>;
}

export function UnitSummary({ vehicle }: { vehicle: BoardVehicle | null }) {
  if (!vehicle) return <span className="text-text-dim">{c.noUnit}</span>;
  const type = vehicle.unit_type
    ? unitTypeLabels[vehicle.unit_type]
    : vehicleKindLabels[vehicle.kind];
  const capacity =
    vehicle.capacity_kg === null ? null : c.unitCapacity(number.format(vehicle.capacity_kg));
  return (
    <span className="block space-y-0.5">
      <span className="block text-text">
        {[type, capacity, vehicle.model_year].filter(Boolean).join(' · ')}
      </span>
      <span
        className={cn(
          'block text-footnote',
          vehicle.documents_complete ? 'text-ok-text' : 'text-red-text',
        )}
      >
        {vehicle.documents_complete ? c.unitDocsComplete : c.unitDocsIncomplete}
      </span>
    </span>
  );
}

/** Status of a negotiation from the shipper's point of view. */
export function negotiationLabel(row: BoardRow): string {
  return row.state === 'awaiting_carrier'
    ? c.awaitingCarrier
    : offerStatusLabels[row.latest.status];
}

/**
 * Comparator of the offers of a load: one cell per carrier with its offer
 * against the proposed price, its unit, its verification and its provider
 * status with the shipper (G6), and the way into the negotiation.
 */
export function OfferBoard({
  loadId,
  rows,
  providerStates = {},
}: {
  loadId: string;
  rows: readonly BoardRow[];
  /** Provider status by carrier company id; missing = pending. */
  providerStates?: Readonly<Record<string, ProviderState>>;
}) {
  return (
    <Group>
      {rows.map((row) => (
        <div
          key={row.negotiationId}
          className={cn(
            groupRow,
            'flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-4 py-3.5',
          )}
        >
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-headline text-text">{row.carrierName}</p>
              <VerificationBadge status={row.carrierStatus} />
              <ProviderBadge state={providerStates[row.carrierCompanyId] ?? 'pending'} />
            </div>
            <p className="flex flex-wrap items-baseline gap-x-2 text-subhead text-text-dim">
              <span className="text-title3 text-text tabular-nums">
                {formatMxn(row.latest.amount_cents)}
              </span>
              <span
                className={cn(
                  'tabular-nums',
                  row.deltaCents > 0 && 'text-red-text',
                  row.deltaCents < 0 && 'text-ok-text',
                )}
              >
                {c.columns.vsProposed}: {formatDelta(row.deltaCents, c.same)}
              </span>
            </p>
            <p className="text-footnote text-text-dim">
              {row.latest.side === 'shipper' && <>{c.yourOffer} · </>}
              {formatDateTime(row.latest.created_at)}
            </p>
            <div className="text-subhead">
              <UnitSummary vehicle={row.vehicle} />
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-col sm:items-end">
            <Pill tone={negotiationTone(row.state)}>{negotiationLabel(row)}</Pill>
            <Link
              href={negotiationPath(loadId, row.negotiationId)}
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              {c.open}
            </Link>
            {row.unreadMessages > 0 && (
              <p className="text-footnote font-semibold text-accent-text">
                {c.unread(row.unreadMessages)}
              </p>
            )}
          </div>
        </div>
      ))}
    </Group>
  );
}
