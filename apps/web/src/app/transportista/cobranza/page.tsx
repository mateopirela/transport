import {
  collectionsTotals,
  formatBasisPoints,
  formatCalendarDate,
  formatMxn,
  freightCopy,
  freightInvoicesCopy,
  quickPayBlockerLabels,
  quickPayCopy,
  quickPayState,
  toMexicoCityDate,
  type FulmisFiscalData,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import {
  CarrierStatusPill,
  dueLabel,
  FreightTotals,
  InvoiceSummary,
} from '@/components/freight/freight-ui';
import { InvoiceUpload } from '@/components/freight/invoice-upload';
import { QuickPayRequest } from '@/components/freight/quick-pay';
import { textLink } from '@/components/page-section';
import { Empty } from '@/components/ui/empty';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Table } from '@/components/ui/table';
import { carrierContext } from '@/lib/carrier/context';
import { loadFreightInvoices, loadFulmisFiscalData } from '@/lib/freight/invoices';
import { loadCarrierFreight, loadQuickPayFee, type CarrierFreightRow } from '@/lib/freight/queries';
import { carrierTripPath, paths } from '@/lib/routing';

const c = freightCopy.collections;

export const metadata: Metadata = { title: c.title };

/**
 * Cobranza (I3, D34-E1): what Fulmis pays the carrier for each trip. The
 * totals ("Por cobrar", "Retenido", "Pagado este mes") and, per trip, the
 * freight, the commission, the net, the date and the status. The Gerente
 * sees the whole company and a Coordinador their business units
 * (carrier_freight_ledger); the business unit picker narrows it. Under each
 * trip (I5), the carrier's CFDI to Fulmis or "Subir CFDI" (Edge Function
 * validate-carrier-cfdi), with Fulmis' fiscal data on top; and its quick
 * pay (I4): "Pedir pago rápido" with the fee and the quick net, or where the
 * request stands.
 */
export default async function CollectionsPage() {
  const { supabase, units } = await carrierContext(paths.carrierCollections);
  const [all, invoices, fulmis, quickPayFeeBps] = await Promise.all([
    loadCarrierFreight(supabase),
    loadFreightInvoices(supabase, 'carrier_to_fulmis'),
    loadFulmisFiscalData(supabase),
    loadQuickPayFee(supabase),
  ]);
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
      <FulmisCard fulmis={fulmis} />
      {rows.length === 0 ? (
        <Empty title={c.empty} description={c.emptyHelp} />
      ) : (
        <Table headers={[c.trip, c.freight, c.commissionShort, c.net, c.dueOn, c.paid, c.status]}>
          {rows.map((row) => (
            <tr key={row.ledger_id} data-testid={`collections-row-${row.trip_id}`}>
              <td className="min-w-60">
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
                <div className="mt-2 border-t pt-2">
                  <InvoiceSummary
                    invoice={invoices.get(row.trip_id)}
                    area="carrier"
                    fallback={
                      <div className="space-y-1">
                        <p className="text-footnote text-text-dim">
                          {freightInvoicesCopy.carrier.missing}
                        </p>
                        <InvoiceUpload tripId={row.trip_id} direction="carrier_to_fulmis" compact />
                      </div>
                    }
                  />
                </div>
                <QuickPaySection row={row} feeBps={quickPayFeeBps} />
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

/**
 * The quick pay of a trip (I4, D38): where its request stands (requested,
 * approved, or rejected with the reason) and, while it can be asked for,
 * "Pedir pago rápido" with the fee and what the carrier gets.
 */
function QuickPaySection({ row, feeBps }: { row: CarrierFreightRow; feeBps: number | null }) {
  const q = quickPayCopy.carrier;
  const state = quickPayState(row);
  const quickNet = row.quick_pay_net_cents === null ? null : formatMxn(row.quick_pay_net_cents);
  let status = null;
  if (state.kind === 'requested' && quickNet) status = q.requested(quickNet);
  else if (state.kind === 'approved' && quickNet) status = q.approved(quickNet);
  else if (state.kind === 'rejected') status = q.rejected(state.reason);
  const hint = row.quick_pay_blocker ? quickPayBlockerLabels[row.quick_pay_blocker] : null;
  const canRequest = row.quick_pay_blocker === null && feeBps !== null;
  if (!status && !hint && !canRequest) return null;
  return (
    <div className="mt-2 space-y-1 border-t pt-2" data-testid={`quick-pay-${row.trip_id}`}>
      <h4 className="text-footnote font-semibold text-text-dim uppercase">{quickPayCopy.title}</h4>
      {status && (
        <p
          data-testid="quick-pay-status"
          className={state.kind === 'rejected' ? 'text-subhead text-red-text' : 'text-subhead'}
        >
          {status}
        </p>
      )}
      {hint && <p className="text-footnote text-text-dim">{hint}</p>}
      {canRequest && (
        <QuickPayRequest tripId={row.trip_id} netCents={row.net_cents} feeBps={feeBps} />
      )}
    </div>
  );
}

/** Who the carrier invoices (I5): Fulmis' fiscal data, or that it is in process. */
function FulmisCard({ fulmis }: { fulmis: FulmisFiscalData }) {
  const f = freightInvoicesCopy.fulmis;
  const facts = (
    [
      [f.legalName, fulmis.legalName],
      [f.rfc, fulmis.rfc],
      [f.taxRegime, fulmis.taxRegime],
      [f.zip, fulmis.zip],
    ] as const
  ).flatMap(([label, value]) => (value === null ? [] : [{ label, value }]));
  return (
    <section
      aria-label={f.title}
      data-testid="fulmis-fiscal-data"
      className="mb-6 space-y-2 rounded-2xl border bg-cell px-4 py-3.5"
    >
      <h2 className="text-headline text-text">{f.title}</h2>
      <p className="text-subhead text-text-dim">{f.help}</p>
      {fulmis.rfc === null && <p className="text-subhead text-amber-text">{f.inProcess}</p>}
      {facts.length > 0 && (
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {facts.map((fact) => (
            <div key={fact.label} className="flex items-baseline gap-2">
              <dt className="text-subhead text-text-dim">{fact.label}</dt>
              <dd className="text-subhead text-text">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
