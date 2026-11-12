import {
  adminPanelCopy,
  formatBasisPoints,
  formatCalendarDate,
  formatMoney,
  freightCopy,
  freightInvoicesCopy,
  freightPaymentDirectionLabels,
  projectedExposure,
  quickPayCopy,
  quickPayState,
  toMexicoCityDate,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { ApproveQuickPayForm, RejectQuickPayForm } from '@/components/admin/quick-pay-forms';
import { RecordPaymentForm, ResolveReviewForm } from '@/components/freight/admin-freight-forms';
import {
  CarrierStatusPill,
  ClientStatusPill,
  dueLabel,
  InvoiceSummary,
} from '@/components/freight/freight-ui';
import { InvoiceUpload } from '@/components/freight/invoice-upload';
import { textLink } from '@/components/page-section';
import { buttonVariants } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { KpiGrid, KpiTile } from '@/components/ui/kpi-tile';
import { Money } from '@/components/ui/money';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Segmented } from '@/components/ui/segmented';
import {
  FREIGHT_FILTERS,
  matchesFreightFilter,
  parseFreightFilter,
  carrierWaitsForClient,
  payableDirections,
  type FreightFilter,
} from '@/lib/freight/filters';
import { invoiceKey, loadFreightInvoices, type FreightInvoice } from '@/lib/freight/invoices';
import {
  loadAdminFreight,
  loadQuickPayAdmin,
  type AdminFreightRow,
  type QuickPayAdminState,
} from '@/lib/freight/queries';
import { freightAttention } from '@/lib/admin/dashboard';
import { withParams } from '@/lib/pagination';
import { adminCompanyPath, paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

const c = freightCopy.admin;
const q = quickPayCopy.admin;
const h = adminPanelCopy.home;
const f = adminPanelCopy.freight;

/** The label over a part of a trip's block. */
const partLabel = 'text-label text-text-dim';

export const metadata: Metadata = { title: c.title };

const FILTER_LABELS: Record<FreightFilter, string> = {
  todos: c.filters.all,
  vencidos: c.filters.overdue,
  cliente: c.filters.clientOpen,
  transportista: c.filters.carrierOpen,
  retenidos: c.filters.onHold,
  rapido: q.filter,
  revisar: c.filters.review,
};

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="text-subhead text-text-dim">{label}</dt>
      <dd className="text-subhead text-text tabular-nums">{children}</dd>
    </div>
  );
}

/**
 * Both CFDI of a trip (I5): Fulmis' invoice to the client (or "Subir factura
 * emitida" while the provider is manual, once the client has terms) and the
 * carrier's invoice to Fulmis.
 */
function InvoicesSection({
  row,
  client,
  carrier,
}: {
  row: AdminFreightRow;
  client: FreightInvoice | undefined;
  carrier: FreightInvoice | undefined;
}) {
  const fi = freightInvoicesCopy.admin;
  const cancelled = row.client_status === 'cancelled';
  let clientFallback = <p className="text-subhead text-text-dim">{fi.noClientInvoice}</p>;
  if (!cancelled) {
    clientFallback =
      row.client_terms_days === null ? (
        <p className="text-subhead text-text-dim">{fi.termsFirst}</p>
      ) : (
        <div className="space-y-1">
          <p className="text-subhead text-text-dim">{fi.noClientInvoice}</p>
          <InvoiceUpload tripId={row.trip_id} direction="fulmis_to_client" />
        </div>
      );
  }
  return (
    <div className="grid gap-4 border-t px-5 py-4 sm:grid-cols-2">
      <section
        aria-label={fi.clientInvoice}
        className="space-y-1"
        data-testid="freight-client-invoice"
      >
        <h4 className={partLabel}>{fi.clientInvoice}</h4>
        <InvoiceSummary invoice={client} area="admin" fallback={clientFallback} />
      </section>
      <section
        aria-label={fi.carrierInvoice}
        className="space-y-1"
        data-testid="freight-carrier-invoice"
      >
        <h4 className={partLabel}>{fi.carrierInvoice}</h4>
        <InvoiceSummary
          invoice={carrier}
          area="admin"
          fallback={<p className="text-subhead text-text-dim">{fi.noCarrierInvoice}</p>}
        />
      </section>
    </div>
  );
}

function day(iso: string): string {
  return formatCalendarDate(toMexicoCityDate(iso));
}

/**
 * The quick pay of a trip (I4, D38): the frozen fee and the quick net, where
 * the request stands, and the admin's decision while it is pending (with the
 * exposure warning when it would go over the limit). The client's side does
 * not change.
 */
function QuickPayFacts({ row, quickPay }: { row: AdminFreightRow; quickPay: QuickPayAdminState }) {
  const state = quickPayState(row);
  if (state.kind === 'none') return null;
  if (state.kind === 'rejected') {
    return (
      <p className="border-t px-5 py-4 text-subhead text-text-dim" data-testid="freight-quick-pay">
        {q.rejected(day(state.at), state.reason)}
      </p>
    );
  }
  const fee = row.quick_pay_fee_cents ?? 0;
  const quickNet = row.carrier_net_cents - fee;
  const projection = projectedExposure(
    quickPay.exposureCents,
    quickNet,
    row.client_paid_cents,
    quickPay.limitCents,
  );
  return (
    <div className="space-y-2 border-t px-5 py-4" data-testid="freight-quick-pay">
      <h4 className={partLabel}>{q.filter}</h4>
      <p className="text-subhead font-semibold text-text">
        {state.kind === 'requested' ? q.requested(day(state.at)) : q.approved(day(state.at))}
      </p>
      <dl>
        <Fact label={q.fee(formatBasisPoints(row.quick_pay_fee_bps ?? 0))}>{formatMoney(fee)}</Fact>
        <Fact label={q.quickNet}>{formatMoney(quickNet)}</Fact>
      </dl>
      <p className="text-footnote text-text-dim">{q.clientUnchanged}</p>
      {state.kind === 'requested' && row.carrier_invoice_blocker && (
        // The carrier's CFDI is not validated: no approval, and why (I4).
        <Notice tone="info">
          <span data-testid="quick-pay-invoice-blocker">
            {q.invoiceBlockers[row.carrier_invoice_blocker]}
          </span>
        </Notice>
      )}
      {state.kind === 'requested' && (
        <div className="flex flex-wrap items-start gap-3">
          {!row.carrier_invoice_blocker && (
            <ApproveQuickPayForm
              tripId={row.trip_id}
              quickNet={formatMoney(quickNet)}
              overLimit={
                projection.overLimit && quickPay.limitCents !== null
                  ? q.overLimit(
                      formatMoney(projection.exposureCents),
                      formatMoney(quickPay.limitCents),
                    )
                  : null
              }
            />
          )}
          <RejectQuickPayForm tripId={row.trip_id} />
        </div>
      )}
    </div>
  );
}

function LedgerCard({
  row,
  invoices,
  quickPay,
}: {
  row: AdminFreightRow;
  invoices: ReadonlyMap<string, FreightInvoice>;
  quickPay: QuickPayAdminState;
}) {
  const directions = payableDirections(row);
  return (
    <article data-testid={`freight-row-${row.trip_id}`} className="border bg-cell">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-5 py-4">
        <div className="min-w-0 space-y-0.5">
          <h3 className="text-headline text-text">
            {freightCopy.route(row.origin_city, row.destination_city)}
          </h3>
          <p className="text-subhead text-text-dim">
            <Link href={adminCompanyPath(row.shipper_company_id)} className={textLink}>
              {row.shipper_name}
            </Link>
            {' → '}
            <Link href={adminCompanyPath(row.carrier_company_id)} className={textLink}>
              {row.carrier_name}
            </Link>
          </p>
        </div>
      </header>
      {row.needs_review && (
        <div className="space-y-2 border-t px-5 py-4">
          <Notice tone="error">{c.needsReview}</Notice>
          <ResolveReviewForm tripId={row.trip_id} />
        </div>
      )}
      <div className="grid border-t sm:grid-cols-2 sm:divide-x sm:divide-separator">
        <section aria-label={c.clientSide} className="space-y-2 px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className={partLabel}>{c.clientSide}</h4>
            <span data-testid="freight-client-status">
              <ClientStatusPill status={row.client_status} />
            </span>
          </div>
          <dl>
            <Fact label={c.amount}>{formatMoney(row.client_amount_cents)}</Fact>
            <Fact label={c.terms}>
              {row.client_terms_days
                ? freightCopy.termsDays(row.client_terms_days)
                : freightCopy.termsToBeDefined}
            </Fact>
            <Fact label={c.dueOn}>
              {dueLabel(row.client_due_on, freightCopy.dueOnAfterDelivery)}
            </Fact>
            <Fact label={c.paid}>{formatMoney(row.client_paid_cents)}</Fact>
          </dl>
        </section>
        <section aria-label={c.carrierSide} className="space-y-2 border-t px-5 py-4 sm:border-t-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className={partLabel}>{c.carrierSide}</h4>
            <span data-testid="freight-carrier-status">
              <CarrierStatusPill status={row.carrier_status} />
            </span>
          </div>
          <dl>
            <Fact label={`${c.commission} (${formatBasisPoints(row.commission_bps)})`}>
              {formatMoney(row.commission_cents)}
            </Fact>
            <Fact label={c.net}>{formatMoney(row.carrier_net_cents)}</Fact>
            {/* A brokered load (I6, D39): Fulmis's income is the margin, not a commission. */}
            {row.margin_cents > 0 && (
              <Fact label={c.margin}>
                <span data-testid="freight-margin">{formatMoney(row.margin_cents)}</span>
              </Fact>
            )}
            <Fact label={c.dueOn}>
              {dueLabel(row.carrier_due_on, freightCopy.dueOnAfterDelivery)}
            </Fact>
            <Fact label={c.paid}>{formatMoney(row.carrier_paid_cents)}</Fact>
          </dl>
        </section>
      </div>
      <QuickPayFacts row={row} quickPay={quickPay} />
      <InvoicesSection
        row={row}
        client={invoices.get(invoiceKey(row.trip_id, 'fulmis_to_client'))}
        carrier={invoices.get(invoiceKey(row.trip_id, 'carrier_to_fulmis'))}
      />
      <div className="space-y-2 border-t px-5 py-4">
        <h4 className={partLabel}>{c.payments}</h4>
        {row.payments.length === 0 ? (
          <p className="text-subhead text-text-dim">{c.noPayments}</p>
        ) : (
          <ul className="space-y-1 text-subhead text-text">
            {row.payments.map((payment) => (
              <li key={payment.id} className="tabular-nums">
                {freightPaymentDirectionLabels[payment.direction]}:{' '}
                {formatMoney(payment.amountCents)} · {formatCalendarDate(payment.paidOn)} ·{' '}
                <span className="text-meta">{payment.speiReference}</span>
                {payment.note && <span className="text-text-dim"> · {payment.note}</span>}
              </li>
            ))}
          </ul>
        )}
        {carrierWaitsForClient(row) && (
          <p className="text-subhead text-text-dim">{c.carrierWaitsForClient}</p>
        )}
        {directions.length > 0 && (
          <RecordPaymentForm tripId={row.trip_id} directions={directions} />
        )}
      </div>
    </article>
  );
}

/**
 * Admin: the freight ledger (I3, D08-E2). Every trip with what the client
 * owes and what is paid to the carrier, filtered by status; "Registrar pago"
 * for each SPEI payment (client or carrier) and the default commission.
 * Every change is an RPC that checks the admin and is audited. Each trip also
 * shows both CFDI (I5) and takes Fulmis' invoice to the client, and its
 * quick pay request (I4) with "Aprobar" and "Rechazar"; the quick pay fee
 * and exposure limit are set here too.
 */
export default async function AdminFreightPage({ searchParams }: PageProps<'/admin/flete'>) {
  await requireAccess(paths.adminFreight);
  const supabase = await createClient();
  if (!supabase) return <PageHeader title={c.title} />;
  const filter = parseFreightFilter((await searchParams).filtro);
  const [rows, invoices, quickPay] = await Promise.all([
    loadAdminFreight(supabase),
    loadFreightInvoices(supabase),
    loadQuickPayAdmin(supabase),
  ]);
  const shown = rows.filter((row) => matchesFreightFilter(row, filter));
  const attention = freightAttention(rows);
  const filterHref = (value: FreightFilter) =>
    withParams(paths.adminFreight, {}, value === 'todos' ? {} : { filtro: value });

  return (
    <>
      <PageHeader
        title={c.title}
        description={c.description}
        action={
          <Link
            href={`${paths.adminSettings}#comision`}
            className={buttonVariants({ variant: 'secondary' })}
          >
            {f.settingsLink}
          </Link>
        }
      />
      <div className="space-y-10">
        <KpiGrid>
          <KpiTile
            label={c.filters.overdue}
            value={attention.overdue.length}
            href={filterHref('vencidos')}
            attention={attention.overdue.length > 0}
          />
          <KpiTile
            label={h.tags.carrierPayment}
            value={attention.carrierPayable.length}
            hint={f.carrierPayableHint}
            href={filterHref('transportista')}
            attention={attention.carrierPayable.length > 0}
          />
          <KpiTile
            label={q.filter}
            value={attention.quickPay.length}
            href={filterHref('rapido')}
            attention={attention.quickPay.length > 0}
          />
          <KpiTile
            label={q.exposure}
            value={<Money cents={quickPay.exposureCents} />}
            hint={
              <span data-testid="quick-pay-exposure">
                {q.exposureLine(
                  formatMoney(quickPay.exposureCents),
                  quickPay.limitCents === null ? null : formatMoney(quickPay.limitCents),
                )}
              </span>
            }
          />
        </KpiGrid>

        <section aria-label={c.trips} className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b pb-6">
            <Segmented
              label={c.filters.label}
              value={filter}
              items={FREIGHT_FILTERS.map((value) => ({
                value,
                label: FILTER_LABELS[value],
                href: filterHref(value),
              }))}
            />
            <p className="text-footnote text-text-dim tabular-nums sm:ml-auto">
              {f.trips(shown.length)}
            </p>
          </div>
          {shown.length === 0 ? (
            <Empty title={c.empty} />
          ) : (
            <div className="space-y-4">
              {shown.map((row) => (
                <LedgerCard key={row.ledger_id} row={row} invoices={invoices} quickPay={quickPay} />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
