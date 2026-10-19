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
import { Table } from '@/components/ui/table';
import { formatDelta, type BoardRow, type BoardVehicle } from '@/lib/offers/board';
import { negotiationPath } from '@/lib/routing';
import { cn } from '@/lib/utils';

const c = offersCopy.board;
const number = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });

/** Carrier verification status (companies, B03), as the shipper sees it. */
export function VerificationBadge({ status }: { status: VerificationStatus }) {
  return (
    <span
      className={cn(
        'inline-block rounded-full border px-2 py-0.5 text-xs whitespace-nowrap',
        status === 'approved'
          ? 'border-success/30 bg-success/10 text-success'
          : 'border-destructive/30 bg-destructive/5 text-destructive',
      )}
    >
      {offersCopy.verification[status]}
    </span>
  );
}

export function UnitSummary({ vehicle }: { vehicle: BoardVehicle | null }) {
  if (!vehicle) return <span className="text-muted-foreground">{c.noUnit}</span>;
  const type = vehicle.unit_type
    ? unitTypeLabels[vehicle.unit_type]
    : vehicleKindLabels[vehicle.kind];
  const capacity =
    vehicle.capacity_kg === null ? null : c.unitCapacity(number.format(vehicle.capacity_kg));
  return (
    <div className="space-y-1">
      <p>{[type, capacity, vehicle.model_year].filter(Boolean).join(' · ')}</p>
      <p
        className={cn('text-xs', vehicle.documents_complete ? 'text-success' : 'text-destructive')}
      >
        {vehicle.documents_complete ? c.unitDocsComplete : c.unitDocsIncomplete}
      </p>
    </div>
  );
}

/** Status of a negotiation from the shipper's point of view. */
export function negotiationLabel(row: BoardRow): string {
  return row.state === 'awaiting_carrier'
    ? c.awaitingCarrier
    : offerStatusLabels[row.latest.status];
}

/**
 * Comparator of the offers of a load: one row per carrier, with its
 * verification and its provider status with the shipper (G6).
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
    <Table
      headers={[
        c.columns.carrier,
        c.columns.amount,
        c.columns.vsProposed,
        c.columns.unit,
        c.columns.status,
        c.columns.actions,
      ]}
    >
      {rows.map((row) => (
        <tr key={row.negotiationId} className={cn(row.state === 'accepted' && 'bg-success/5')}>
          <td>
            <p className="font-medium">{row.carrierName}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              <VerificationBadge status={row.carrierStatus} />
              <ProviderBadge state={providerStates[row.carrierCompanyId] ?? 'pending'} />
            </div>
          </td>
          <td className="whitespace-nowrap">
            <p className="font-medium">{formatMxn(row.latest.amount_cents)}</p>
            {row.latest.side === 'shipper' && (
              <p className="text-xs text-muted-foreground">{c.yourOffer}</p>
            )}
            <p className="text-xs text-muted-foreground">{formatDateTime(row.latest.created_at)}</p>
          </td>
          <td
            className={cn(
              'whitespace-nowrap',
              row.deltaCents > 0 && 'text-destructive',
              row.deltaCents < 0 && 'text-success',
            )}
          >
            {formatDelta(row.deltaCents, c.same)}
          </td>
          <td>
            <UnitSummary vehicle={row.vehicle} />
          </td>
          <td className="whitespace-nowrap">{negotiationLabel(row)}</td>
          <td>
            <Link
              href={negotiationPath(loadId, row.negotiationId)}
              className={buttonVariants({
                variant: row.state === 'respond' ? 'accent' : 'outline',
                size: 'sm',
              })}
            >
              {c.open}
            </Link>
            {row.unreadMessages > 0 && (
              <p className="mt-1 text-xs text-accent">{c.unread(row.unreadMessages)}</p>
            )}
          </td>
        </tr>
      ))}
    </Table>
  );
}
