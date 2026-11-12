import {
  clientListsCopy,
  formatDateTime,
  formatMoney,
  offersCopy,
  offerStatusLabels,
  unitTypeLabels,
  vehicleKindLabels,
  type ProviderState,
  type VerificationStatus,
} from '@transport/shared';
import { Check, CircleAlert } from 'lucide-react';
import Link from 'next/link';

import { ProviderBadge } from '@/components/shared-documents/provider-status';
import { buttonVariants } from '@/components/ui/button';
import { Money } from '@/components/ui/money';
import { Pill } from '@/components/ui/pill';
import { formatDelta, type BoardRow, type BoardVehicle } from '@/lib/offers/board';
import { negotiationPath } from '@/lib/routing';
import { negotiationTone, verificationTone } from '@/lib/status-tones';
import { cn } from '@/lib/utils';

import { OfferResponse } from './offer-response';

const c = offersCopy.board;
const number = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });

/** Carrier verification status (companies, B03), as the shipper sees it. */
export function VerificationBadge({ status }: { status: VerificationStatus }) {
  return <Pill tone={verificationTone(status)}>{offersCopy.verification[status]}</Pill>;
}

/**
 * The unit a carrier proposed: its type, capacity and year, and whether its
 * documents are complete (said in words and with an icon, never by colour).
 */
export function UnitSummary({ vehicle }: { vehicle: BoardVehicle | null }) {
  if (!vehicle) return <span className="text-text-dim">{c.noUnit}</span>;
  const type = vehicle.unit_type
    ? unitTypeLabels[vehicle.unit_type]
    : vehicleKindLabels[vehicle.kind];
  const capacity =
    vehicle.capacity_kg === null ? null : c.unitCapacity(number.format(vehicle.capacity_kg));
  const Icon = vehicle.documents_complete ? Check : CircleAlert;
  return (
    <span className="block space-y-0.5">
      <span className="block text-text">
        {[type, capacity, vehicle.model_year].filter(Boolean).join(' · ')}
      </span>
      <span
        className={cn(
          'flex items-center gap-1 text-footnote',
          vehicle.documents_complete ? 'text-text-dim' : 'text-red-text',
        )}
      >
        <Icon aria-hidden className="size-3.5 shrink-0" />
        {vehicle.documents_complete ? c.unitDocsComplete : c.unitDocsIncomplete}
      </span>
    </span>
  );
}

/** Status of a negotiation from the shipper's point of view. */
export function negotiationLabel(row: BoardRow): string {
  if (row.state === 'awaiting_carrier') return c.awaitingCarrier;
  if (row.state === 'respond') return clientListsCopy.offer.respond;
  return offerStatusLabels[row.latest.status];
}

/**
 * The offers of a load (§1.5): one card per carrier with its offer against
 * the proposed price, its unit, its verification and its provider status with
 * the shipper (G6). An offer waiting for the client carries its buttons
 * (accept, counter, reject); the first of them, the cheapest (the board
 * puts it first), has the screen's filled primary. Every card opens the
 * negotiation and its chat.
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
  const first = rows.find((row) => row.state === 'respond')?.negotiationId;
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.negotiationId} className="border bg-cell">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-5 py-4">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-headline text-text">{row.carrierName}</p>
                <VerificationBadge status={row.carrierStatus} />
                <ProviderBadge state={providerStates[row.carrierCompanyId] ?? 'pending'} />
              </div>
              <div className="text-subhead">
                <UnitSummary vehicle={row.vehicle} />
              </div>
              {row.latest.conditions && (
                <p className="text-footnote text-text-dim">
                  {offersCopy.negotiation.conditions}: {row.latest.conditions}
                </p>
              )}
            </div>
            <div className="shrink-0 space-y-0.5 sm:text-right">
              <Money cents={row.latest.amount_cents} size="title" className="block" />
              <p
                className={cn(
                  'text-footnote tabular-nums',
                  row.deltaCents > 0 ? 'text-red-text' : 'text-text-dim',
                )}
              >
                {row.deltaCents === 0
                  ? `${c.columns.vsProposed}: ${c.same}`
                  : clientListsCopy.offer.delta(formatDelta(row.deltaCents, c.same))}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t px-5 py-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Pill tone={negotiationTone(row.state)}>{negotiationLabel(row)}</Pill>
              <span className="text-meta text-text-dim">
                {row.latest.side === 'shipper' && <>{c.yourOffer} · </>}
                {formatDateTime(row.latest.created_at)}
              </span>
              {row.unreadMessages > 0 && (
                <span className="text-footnote font-semibold text-accent-text">
                  {c.unread(row.unreadMessages)}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {row.state === 'respond' && (
                <OfferResponse
                  offerId={row.latest.id}
                  amount={formatMoney(row.latest.amount_cents)}
                  carrier={row.carrierName}
                  conditions={row.latest.conditions}
                  primary={row.negotiationId === first}
                />
              )}
              <Link
                href={negotiationPath(loadId, row.negotiationId)}
                className={buttonVariants({ variant: 'plain' })}
              >
                {c.open}
              </Link>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
