import {
  collectionsTotals,
  formatBasisPoints,
  formatCalendarDate,
  formatMoney,
  freightCopy,
  freightInvoicesCopy,
  quickPayBlockerLabels,
  quickPayCopy,
  quickPayState,
  toMexicoCityDate,
  type FulmisFiscalData,
} from '@transport/shared';
import { Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { DashboardSection } from '@/components/carrier/dashboard';
import { CarrierStatusPill, dueLabel, InvoiceSummary } from '@/components/freight/freight-ui';
import { InvoiceUpload } from '@/components/freight/invoice-upload';
import { QuickPayRequest } from '@/components/freight/quick-pay';
import { textLink } from '@/components/page-section';
import { Empty } from '@/components/ui/empty';
import { KpiGrid, KpiTile } from '@/components/ui/kpi-tile';
import { Money } from '@/components/ui/money';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Table, TableCell, TableRow } from '@/components/ui/table';
import { carrierContext } from '@/lib/carrier/context';
import { loadFreightInvoices, loadFulmisFiscalData } from '@/lib/freight/invoices';
import { loadCarrierFreight, loadQuickPayFee, type CarrierFreightRow } from '@/lib/freight/queries';
import { carrierTripPath, paths } from '@/lib/routing';

const c = freightCopy.collections;

export const metadata: Metadata = { title: c.title };

/**
 * Cobranza (I3, D34-E1): what Fulmis pays the carrier for each trip. The
 * totals as indicators, "Por cobrar" first (docs/plan-fulmis.md §1.5), and,
 * per trip, the freight, the commission, the net, the date and the status.
 * The Gerente sees the whole company and a Coordinador their business units
 * (carrier_freight_ledger); the business unit picker narrows it. Under each
 * trip (I5), the carrier's CFDI to Fulmis or "Subir CFDI" (Edge Function
 * validate-carrier-cfdi), with Fulmis' fiscal data under the table; and its
 * quick pay (I4): "Pedir pago rápido" with the fee and the quick net, or
 * where the request stands.
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
      <div className="space-y-10">
        <div className="space-y-4">
          <KpiGrid>
            <KpiTile
              label={c.receivable}
              value={
                <Money
                  cents={totals.receivableCents}
                  size="numeral"
                  data-testid="collections-receivable"
                />
              }
            />
            <KpiTile
              label={c.onHold}
              value={
                <Money
                  cents={totals.onHoldCents}
                  size="numeral"
                  data-testid="collections-on-hold"
                />
              }
              attention={totals.onHoldCents > 0}
            />
            <KpiTile
              label={c.paidThisMonth}
              value={
                <Money
                  cents={totals.paidThisMonthCents}
                  size="numeral"
                  data-testid="collections-paid-month"
                />
              }
            />
          </KpiGrid>
          {totals.onHoldCents > 0 && <Notice tone="pending">{c.onHoldHelp}</Notice>}
        </div>

        {rows.length === 0 ? (
          <Empty icon={Wallet} title={c.empty} description={c.emptyHelp} />
        ) : (
          <Table
            cards
            headers={[
              c.trip,
              { label: c.freight, align: 'right' },
              { label: c.commissionShort, align: 'right' },
              { label: c.net, align: 'right' },
              c.dueOn,
              { label: c.paid, align: 'right' },
              c.status,
            ]}
          >
            {rows.map((row) => (
              <TableRow
                key={row.ledger_id}
                data-testid={`collections-row-${row.trip_id}`}
                className="[&_td]:align-top [&_td]:py-3"
              >
                <TableCell primary className="min-w-64 font-normal">
                  {/* One block: on a phone each cell of the card is a row. */}
                  <div className="w-full min-w-0">
                    <Link
                      href={carrierTripPath(row.trip_id)}
                      className={`font-semibold ${textLink}`}
                    >
                      {freightCopy.route(row.origin_city, row.destination_city)}
                    </Link>
                    {row.payments.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-footnote font-normal text-text-dim">
                        {row.payments.map((payment) => (
                          <li key={payment.speiReference}>
                            {c.paymentLine(
                              formatMoney(payment.amountCents),
                              formatCalendarDate(payment.paidOn),
                              payment.speiReference,
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-3 space-y-3 border-t pt-3 text-subhead font-normal">
                      <InvoiceSummary
                        invoice={invoices.get(row.trip_id)}
                        area="carrier"
                        fallback={
                          <div className="space-y-1">
                            <p className="text-footnote text-text-dim">
                              {freightInvoicesCopy.carrier.missing}
                            </p>
                            <InvoiceUpload
                              tripId={row.trip_id}
                              direction="carrier_to_fulmis"
                              compact
                            />
                          </div>
                        }
                      />
                      <QuickPaySection row={row} feeBps={quickPayFeeBps} />
                    </div>
                  </div>
                </TableCell>
                <TableCell label={c.freight} numeric className="font-normal">
                  {formatMoney(row.freight_cents)}
                </TableCell>
                <TableCell label={c.commissionShort} numeric className="font-normal text-text-dim">
                  {formatMoney(row.commission_cents)} · {formatBasisPoints(row.commission_bps)}
                </TableCell>
                <TableCell label={c.net} numeric>
                  <Money cents={row.net_cents} className="text-headline" />
                </TableCell>
                <TableCell label={c.dueOn} className="text-meta whitespace-nowrap text-text-dim">
                  {dueLabel(
                    row.due_on,
                    row.delivered_at
                      ? freightCopy.termsToBeDefined
                      : freightCopy.dueOnAfterDelivery,
                  )}
                </TableCell>
                <TableCell label={c.paid} numeric className="font-normal">
                  {formatMoney(row.paid_cents)}
                </TableCell>
                <TableCell label={c.status}>
                  <CarrierStatusPill status={row.status} />
                </TableCell>
              </TableRow>
            ))}
          </Table>
        )}

        <FulmisCard fulmis={fulmis} />
      </div>
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
  const quickNet = row.quick_pay_net_cents === null ? null : formatMoney(row.quick_pay_net_cents);
  let status = null;
  if (state.kind === 'requested' && quickNet) status = q.requested(quickNet);
  else if (state.kind === 'approved' && quickNet) status = q.approved(quickNet);
  else if (state.kind === 'rejected') status = q.rejected(state.reason);
  const hint = row.quick_pay_blocker ? quickPayBlockerLabels[row.quick_pay_blocker] : null;
  const canRequest = row.quick_pay_blocker === null && feeBps !== null;
  if (!status && !hint && !canRequest) return null;
  return (
    <div className="space-y-1 border-t pt-3" data-testid={`quick-pay-${row.trip_id}`}>
      <h4 className="text-label text-text-dim">{quickPayCopy.title}</h4>
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
    <DashboardSection title={f.title} description={f.help}>
      <section aria-label={f.title} data-testid="fulmis-fiscal-data" className="space-y-3">
        {fulmis.rfc === null && <Notice tone="pending">{f.inProcess}</Notice>}
        {facts.length > 0 && (
          <dl className="grid gap-px border bg-separator sm:grid-cols-2 lg:grid-cols-4">
            {facts.map((fact) => (
              <div key={fact.label} className="space-y-1 bg-cell px-4 py-3">
                <dt className="text-label text-text-dim">{fact.label}</dt>
                <dd className="text-subhead text-text">{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </DashboardSection>
  );
}
