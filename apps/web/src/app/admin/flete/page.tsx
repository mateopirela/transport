import {
  formatBasisPoints,
  formatCalendarDate,
  formatMxn,
  freightCopy,
  freightPaymentDirectionLabels,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import {
  CommissionSettingForm,
  RecordPaymentForm,
  ResolveReviewForm,
} from '@/components/freight/admin-freight-forms';
import { CarrierStatusPill, ClientStatusPill, dueLabel } from '@/components/freight/freight-ui';
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
import {
  loadAdminFreight,
  loadCommissionSetting,
  type AdminFreightRow,
} from '@/lib/freight/queries';
import { withParams } from '@/lib/pagination';
import { adminCompanyPath, paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

const c = freightCopy.admin;

export const metadata: Metadata = { title: c.title };

const FILTER_LABELS: Record<FreightFilter, string> = {
  todos: c.filters.all,
  vencidos: c.filters.overdue,
  cliente: c.filters.clientOpen,
  transportista: c.filters.carrierOpen,
  retenidos: c.filters.onHold,
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

function LedgerCard({ row }: { row: AdminFreightRow }) {
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
            <Fact label={c.dueOn}>
              {dueLabel(row.carrier_due_on, freightCopy.dueOnAfterDelivery)}
            </Fact>
            <Fact label={c.paid}>{formatMxn(row.carrier_paid_cents)}</Fact>
          </dl>
        </section>
      </div>
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
 * Every change is an RPC that checks the admin and is audited.
 */
export default async function AdminFreightPage({ searchParams }: PageProps<'/admin/flete'>) {
  await requireAccess(paths.adminFreight);
  const supabase = await createClient();
  if (!supabase) return <PageHeader title={c.title} />;
  const filter = parseFreightFilter((await searchParams).filtro);
  const [rows, commissionBps] = await Promise.all([
    loadAdminFreight(supabase),
    loadCommissionSetting(supabase),
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
                <LedgerCard key={row.ledger_id} row={row} />
              ))}
            </div>
          )}
        </PageSection>
      </div>
    </>
  );
}
