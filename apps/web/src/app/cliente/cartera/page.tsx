import {
  formatCalendarDate,
  formatMoney,
  freightCopy,
  freightInvoicesCopy,
  portfolioTotals,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { rowLink } from '@/components/ui/panel';
import { ClientStatusPill, dueLabel, InvoiceSummary } from '@/components/freight/freight-ui';
import { Empty } from '@/components/ui/empty';
import { KpiGrid, KpiTile } from '@/components/ui/kpi-tile';
import { Money } from '@/components/ui/money';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Table, TableCell, TableRow } from '@/components/ui/table';
import { loadFreightInvoices } from '@/lib/freight/invoices';
import { loadShipperFreight } from '@/lib/freight/queries';
import { shipperContext } from '@/lib/loads/queries';
import { paths, tripPath } from '@/lib/routing';

const c = freightCopy.portfolio;

export const metadata: Metadata = { title: c.title };

/**
 * Cartera (I3, D34-E1): what the client owes Fulmis for each trip. The total
 * balance, what is overdue and what is not yet due as the indicators (V3) and,
 * per trip, the invoice (once Fulmis issues it, I5), the due date, what was
 * paid and what is pending, in a table. Only the client's side
 * (shipper_freight_ledger): never the commission nor the carrier's net. The
 * invoice (I5) is Fulmis' CFDI, read through RLS (only the client's
 * direction) and downloaded signed.
 */
export default async function PortfolioPage() {
  const { supabase, companyId } = await shipperContext(paths.shipperPortfolio);
  const [rows, invoices, company] = await Promise.all([
    loadShipperFreight(supabase),
    loadFreightInvoices(supabase, 'fulmis_to_client'),
    supabase.from('companies').select('payment_terms_days').eq('id', companyId).maybeSingle(),
  ]);
  if (company.error) throw new Error(`Company query failed: ${company.error.message}`);
  const terms = company.data?.payment_terms_days ?? null;
  const totals = portfolioTotals(
    rows.map((row) => ({ status: row.status, pendingCents: row.pending_cents })),
  );

  return (
    <>
      <PageHeader title={c.title} description={c.description} />
      <KpiGrid className="mb-6">
        <KpiTile
          label={c.balance}
          value={<span data-testid="portfolio-balance">{formatMoney(totals.balanceCents)}</span>}
        />
        <KpiTile
          label={c.overdue}
          attention={totals.overdueCents > 0}
          value={
            <span
              data-testid="portfolio-overdue"
              className={totals.overdueCents > 0 ? 'text-red-text' : undefined}
            >
              {formatMoney(totals.overdueCents)}
            </span>
          }
        />
        <KpiTile
          label={c.upcoming}
          value={<span data-testid="portfolio-upcoming">{formatMoney(totals.upcomingCents)}</span>}
        />
      </KpiGrid>
      <Notice tone="info" className="mb-8">
        {terms ? c.termsNote(freightCopy.termsDays(terms)) : c.termsMissing}
      </Notice>
      {rows.length === 0 ? (
        <Empty title={c.empty} description={c.emptyHelp} />
      ) : (
        <Table
          cards
          headers={[
            c.trip,
            c.invoice,
            { label: c.amount, align: 'right' },
            c.dueOn,
            { label: c.paid, align: 'right' },
            { label: c.pending, align: 'right' },
            c.status,
          ]}
        >
          {rows.map((row) => (
            <TableRow key={row.ledger_id} data-testid={`portfolio-row-${row.trip_id}`}>
              <TableCell primary>
                <Link href={tripPath(row.trip_id)} className={rowLink}>
                  {freightCopy.route(row.origin_city, row.destination_city)}
                </Link>
                {row.payments.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-footnote font-normal text-text-dim">
                    {row.payments.map((payment) => (
                      <li key={payment.speiReference}>
                        {freightCopy.collections.paymentLine(
                          formatMoney(payment.amountCents),
                          formatCalendarDate(payment.paidOn),
                          payment.speiReference,
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </TableCell>
              <TableCell label={c.invoice} className="min-w-40">
                <InvoiceSummary
                  invoice={invoices.get(row.trip_id)}
                  area="shipper"
                  showValidation={false}
                  fallback={
                    <span className="text-text-dim">{freightInvoicesCopy.client.none}</span>
                  }
                />
              </TableCell>
              <TableCell label={c.amount} numeric>
                <Money cents={row.amount_cents} />
              </TableCell>
              <TableCell label={c.dueOn} className="whitespace-nowrap text-text-dim">
                {dueLabel(
                  row.due_on,
                  row.terms_days === null
                    ? freightCopy.termsToBeDefined
                    : freightCopy.dueOnAfterDelivery,
                )}
              </TableCell>
              <TableCell label={c.paid} numeric>
                <Money cents={row.paid_cents} />
              </TableCell>
              <TableCell label={c.pending} numeric>
                <Money cents={row.pending_cents} className="font-bold" />
              </TableCell>
              <TableCell label={c.status}>
                <ClientStatusPill status={row.status} />
              </TableCell>
            </TableRow>
          ))}
        </Table>
      )}
    </>
  );
}
