import {
  collectionsTotals,
  formatBasisPoints,
  formatCalendarDate,
  formatMxn,
  freightCopy,
  toMexicoCityDate,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { CarrierStatusPill, dueLabel, FreightTotals } from '@/components/freight/freight-ui';
import { textLink } from '@/components/page-section';
import { Empty } from '@/components/ui/empty';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Table } from '@/components/ui/table';
import { carrierContext } from '@/lib/carrier/context';
import { loadCarrierFreight } from '@/lib/freight/queries';
import { carrierTripPath, paths } from '@/lib/routing';

const c = freightCopy.collections;

export const metadata: Metadata = { title: c.title };

/**
 * Cobranza (I3, D34-E1): what Fulmis pays the carrier for each trip. The
 * totals ("Por cobrar", "Retenido", "Pagado este mes") and, per trip, the
 * freight, the commission, the net, the date and the status. The Gerente
 * sees the whole company and a Coordinador their business units
 * (carrier_freight_ledger); the business unit picker narrows it.
 */
export default async function CollectionsPage() {
  const { supabase, units } = await carrierContext(paths.carrierCollections);
  const all = await loadCarrierFreight(supabase);
  const rows = units.selected
    ? all.filter((row) => row.business_unit_id === units.selected?.id)
    : all;
  const today = toMexicoCityDate(new Date().toISOString());
  const totals = collectionsTotals(
    rows.map((row) => ({
      status: row.status,
      pendingCents: row.pending_cents,
      payments: row.payments,
    })),
    today,
  );

  return (
    <>
      <PageHeader title={c.title} description={c.description} />
      <FreightTotals
        items={[
          { label: c.receivable, cents: totals.receivableCents, testId: 'collections-receivable' },
          {
            label: c.onHold,
            cents: totals.onHoldCents,
            testId: 'collections-on-hold',
            tone: 'amber',
          },
          {
            label: c.paidThisMonth,
            cents: totals.paidThisMonthCents,
            testId: 'collections-paid-month',
          },
        ]}
      />
      {totals.onHoldCents > 0 && (
        <Notice tone="info" className="mb-6">
          {c.onHoldHelp}
        </Notice>
      )}
      {rows.length === 0 ? (
        <Empty title={c.empty} description={c.emptyHelp} />
      ) : (
        <Table headers={[c.trip, c.freight, c.commissionShort, c.net, c.dueOn, c.paid, c.status]}>
          {rows.map((row) => (
            <tr key={row.ledger_id} data-testid={`collections-row-${row.trip_id}`}>
              <td>
                <Link href={carrierTripPath(row.trip_id)} className={textLink}>
                  {freightCopy.route(row.origin_city, row.destination_city)}
                </Link>
                {row.payments.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-footnote text-text-dim">
                    {row.payments.map((payment) => (
                      <li key={payment.speiReference}>
                        {c.paymentLine(
                          formatMxn(payment.amountCents),
                          formatCalendarDate(payment.paidOn),
                          payment.speiReference,
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </td>
              <td className="tabular-nums">{formatMxn(row.freight_cents)}</td>
              <td className="whitespace-nowrap text-text-dim tabular-nums">
                {formatMxn(row.commission_cents)} · {formatBasisPoints(row.commission_bps)}
              </td>
              <td className="font-semibold tabular-nums">{formatMxn(row.net_cents)}</td>
              <td className="whitespace-nowrap text-text-dim">
                {dueLabel(
                  row.due_on,
                  row.delivered_at ? freightCopy.termsToBeDefined : freightCopy.dueOnAfterDelivery,
                )}
              </td>
              <td className="tabular-nums">{formatMxn(row.paid_cents)}</td>
              <td>
                <CarrierStatusPill status={row.status} />
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
