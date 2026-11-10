import {
  centsToPesosInput,
  formatBasisPoints,
  formatCalendarDate,
  formatMxn,
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

import {
  CommissionSettingForm,
  RecordPaymentForm,
  ResolveReviewForm,
} from '@/components/freight/admin-freight-forms';
import {
  CarrierStatusPill,
  ClientStatusPill,
  dueLabel,
  InvoiceSummary,
} from '@/components/freight/freight-ui';
import { InvoiceUpload } from '@/components/freight/invoice-upload';
import {
  ApproveQuickPayForm,
  QuickPaySettingsForm,
  RejectQuickPayForm,
} from '@/components/freight/quick-pay';
import { PageSection, textLink } from '@/components/page-section';
import { Empty } from '@/components/ui/empty';
import { PageHeader } from '@/components/ui/page-header';
import { Segmented } from '@/components/ui/segmented';
import {
  FREIGHT_FILTERS,
  matchesFreightFilter,
  parseFreightFilter,
  payableDirections,
  type FreightFilter,
} from '@/lib/freight/filters';
import { invoiceKey, loadFreightInvoices, type FreightInvoice } from '@/lib/freight/invoices';
import {
  loadAdminFreight,
  loadCommissionSetting,
  loadQuickPayAdmin,
  type AdminFreightRow,
  type QuickPayAdminState,
} from '@/lib/freight/queries';
import { withParams } from '@/lib/pagination';
import { adminCompanyPath, paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

const c = freightCopy.admin;
const q = quickPayCopy.admin;

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
  const f = freightInvoicesCopy.admin;
  const cancelled = row.client_status === 'cancelled';
  let clientFallback = <p className="text-subhead text-text-dim">{f.noClientInvoice}</p>;
  if (!cancelled) {
    clientFallback =
      row.client_terms_days === null ? (
        <p className="text-subhead text-text-dim">{f.termsFirst}</p>
      ) : (
        <div className="space-y-1">
          <p className="text-subhead text-text-dim">{f.noClientInvoice}</p>
          <InvoiceUpload tripId={row.trip_id} direction="fulmis_to_client" />
        </div>
      );
  }
  return (
    <div className="grid gap-4 border-t pt-3 sm:grid-cols-2">
      <section
        aria-label={f.clientInvoice}
        className="space-y-1"
        data-testid="freight-client-invoice"
      >
        <h4 className="text-footnote font-semibold text-text-dim uppercase">{f.clientInvoice}</h4>
        <InvoiceSummary invoice={client} area="admin" fallback={clientFallback} />
      </section>
      <section
        aria-label={f.carrierInvoice}
        className="space-y-1"
        data-testid="freight-carrier-invoice"
      >
        <h4 className="text-footnote font-semibold text-text-dim uppercase">{f.carrierInvoice}</h4>
        <InvoiceSummary
          invoice={carrier}
          area="admin"
          fallback={<p className="text-subhead text-text-dim">{f.noCarrierInvoice}</p>}
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
      <p className="text-subhead text-text-dim" data-testid="freight-quick-pay">
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
    <div className="space-y-2 rounded-2xl bg-accent-soft px-4 py-3" data-testid="freight-quick-pay">
      <p className="text-subhead font-semibold text-text">
        {state.kind === 'requested' ? q.requested(day(state.at)) : q.approved(day(state.at))}
      </p>
      <dl>
        <Fact label={q.fee(formatBasisPoints(row.quick_pay_fee_bps ?? 0))}>{formatMxn(fee)}</Fact>
        <Fact label={q.quickNet}>{formatMxn(quickNet)}</Fact>
      </dl>
      <p className="text-footnote text-text-dim">{q.clientUnchanged}</p>
      {state.kind === 'requested' && (
        <div className="flex flex-wrap items-start gap-3">
          <ApproveQuickPayForm
            tripId={row.trip_id}
            overLimit={
              projection.overLimit && quickPay.limitCents !== null
                ? q.overLimit(formatMxn(projection.exposureCents), formatMxn(quickPay.limitCents))
                : null
            }
          />
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
    <article
      data-testid={`freight-row-${row.trip_id}`}
      className="space-y-4 rounded-2xl border bg-cell p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
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
      </div>
      {row.needs_review && (
        <div
          role="alert"
          className="space-y-1 rounded-2xl bg-red/14 px-4 py-3 text-subhead text-red-text"
        >
          <p>{c.needsReview}</p>
          <ResolveReviewForm tripId={row.trip_id} />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <section aria-label={c.clientSide} className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-footnote font-semibold text-text-dim uppercase">{c.clientSide}</h4>
            <span data-testid="freight-client-status">
              <ClientStatusPill status={row.client_status} />
            </span>
          </div>
          <dl>
            <Fact label={c.amount}>{formatMxn(row.client_amount_cents)}</Fact>
            <Fact label={c.terms}>
              {row.client_terms_days
                ? freightCopy.termsDays(row.client_terms_days)
                : freightCopy.termsToBeDefined}
            </Fact>
            <Fact label={c.dueOn}>
              {dueLabel(row.client_due_on, freightCopy.dueOnAfterDelivery)}
            </Fact>
            <Fact label={c.paid}>{formatMxn(row.client_paid_cents)}</Fact>
          </dl>
        </section>
        <section aria-label={c.carrierSide} className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-footnote font-semibold text-text-dim uppercase">{c.carrierSide}</h4>
            <span data-testid="freight-carrier-status">
              <CarrierStatusPill status={row.carrier_status} />
            </span>
          </div>
          <dl>
            <Fact label={`${c.commission} (${formatBasisPoints(row.commission_bps)})`}>
              {formatMxn(row.commission_cents)}
            </Fact>
            <Fact label={c.net}>{formatMxn(row.carrier_net_cents)}</Fact>
            {/* A brokered load (I6, D39): Fulmis's income is the margin, not a commission. */}
            {row.margin_cents > 0 && (
              <Fact label={c.margin}>
                <span data-testid="freight-margin">{formatMxn(row.margin_cents)}</span>
              </Fact>
            )}
            <Fact label={c.dueOn}>
              {dueLabel(row.carrier_due_on, freightCopy.dueOnAfterDelivery)}
            </Fact>
            <Fact label={c.paid}>{formatMxn(row.carrier_paid_cents)}</Fact>
          </dl>
        </section>
      </div>
      <QuickPayFacts row={row} quickPay={quickPay} />
      <InvoicesSection
        row={row}
        client={invoices.get(invoiceKey(row.trip_id, 'fulmis_to_client'))}
        carrier={invoices.get(invoiceKey(row.trip_id, 'carrier_to_fulmis'))}
      />
      <div className="space-y-2 border-t pt-3">
        <h4 className="text-footnote font-semibold text-text-dim uppercase">{c.payments}</h4>
        {row.payments.length === 0 ? (
          <p className="text-subhead text-text-dim">{c.noPayments}</p>
        ) : (
          <ul className="space-y-1 text-subhead text-text">
            {row.payments.map((payment) => (
              <li key={payment.id} className="tabular-nums">
                {freightPaymentDirectionLabels[payment.direction]}: {formatMxn(payment.amountCents)}{' '}
                · {formatCalendarDate(payment.paidOn)} · {payment.speiReference}
                {payment.note && <span className="text-text-dim"> · {payment.note}</span>}
              </li>
            ))}
          </ul>
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
  const [rows, commissionBps, invoices, quickPay] = await Promise.all([
    loadAdminFreight(supabase),
    loadCommissionSetting(supabase),
    loadFreightInvoices(supabase),
    loadQuickPayAdmin(supabase),
  ]);
  const shown = rows.filter((row) => matchesFreightFilter(row, filter));

  return (
    <>
      <PageHeader title={c.title} description={c.description} />
      <div className="max-w-4xl space-y-12">
        <PageSection title={c.settings}>
          <div className="rounded-2xl border bg-cell p-5">
            <CommissionSettingForm commissionBps={commissionBps} />
          </div>
        </PageSection>

        <PageSection title={q.settings}>
          <div className="space-y-4 rounded-2xl border bg-cell p-5">
            <p className="text-subhead text-text" data-testid="quick-pay-exposure">
              <span className="text-text-dim">{q.exposure}: </span>
              <span className="tabular-nums">
                {q.exposureLine(
                  formatMxn(quickPay.exposureCents),
                  quickPay.limitCents === null ? null : formatMxn(quickPay.limitCents),
                )}
              </span>
            </p>
            <QuickPaySettingsForm
              feeBps={quickPay.feeBps}
              limitPesos={
                quickPay.limitCents === null ? '' : centsToPesosInput(quickPay.limitCents)
              }
            />
          </div>
        </PageSection>

        <PageSection title={c.trips}>
          <Segmented
            label={c.filters.label}
            value={filter}
            items={FREIGHT_FILTERS.map((value) => ({
              value,
              label: FILTER_LABELS[value],
              href: withParams(paths.adminFreight, {}, value === 'todos' ? {} : { filtro: value }),
            }))}
          />
          {shown.length === 0 ? (
            <Empty title={c.empty} />
          ) : (
            <div className="space-y-4">
              {shown.map((row) => (
                <LedgerCard key={row.ledger_id} row={row} invoices={invoices} quickPay={quickPay} />
              ))}
            </div>
          )}
        </PageSection>
      </div>
    </>
  );
}
