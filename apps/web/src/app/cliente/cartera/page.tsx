import { formatCalendarDate, formatMxn, freightCopy, portfolioTotals } from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ClientStatusPill, dueLabel, FreightTotals } from '@/components/freight/freight-ui';
import { textLink } from '@/components/page-section';
import { Empty } from '@/components/ui/empty';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Table } from '@/components/ui/table';
import { loadShipperFreight } from '@/lib/freight/queries';
import { shipperContext } from '@/lib/loads/queries';
import { paths, tripPath } from '@/lib/routing';

const c = freightCopy.portfolio;

export const metadata: Metadata = { title: c.title };

/**
 * Cartera (I3, D34-E1): what the client owes Fulmis for each trip. The total
 * balance, what is overdue and what is not yet due and, per trip, the invoice
 * (once Fulmis issues it, I5), the due date, what was paid and what is
 * pending. Only the client's side (shipper_freight_ledger): never the
 * commission nor the carrier's net.
 */
export default async function PortfolioPage() {
  const { supabase, companyId } = await shipperContext(paths.shipperPortfolio);
  const [rows, company] = await Promise.all([
    loadShipperFreight(supabase),
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
      <FreightTotals
        items={[
          { label: c.balance, cents: totals.balanceCents, testId: 'portfolio-balance' },
          {
            label: c.overdue,
            cents: totals.overdueCents,
            testId: 'portfolio-overdue',
            tone: 'red',
          },
          { label: c.upcoming, cents: totals.upcomingCents, testId: 'portfolio-upcoming' },
        ]}
      />
      <Notice tone="info" className="mb-6">
        {terms ? c.termsNote(freightCopy.termsDays(terms)) : c.termsMissing}
      </Notice>
      {rows.length === 0 ? (
        <Empty title={c.empty} description={c.emptyHelp} />
      ) : (
        <Table headers={[c.trip, c.invoice, c.amount, c.dueOn, c.paid, c.pending, c.status]}>
          {rows.map((row) => (
            <tr key={row.ledger_id} data-testid={`portfolio-row-${row.trip_id}`}>
              <td>
                <Link href={tripPath(row.trip_id)} className={textLink}>
                  {freightCopy.route(row.origin_city, row.destination_city)}
                </Link>
                {row.payments.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-footnote text-text-dim">
                    {row.payments.map((payment) => (
                      <li key={payment.speiReference}>
                        {freightCopy.collections.paymentLine(
                          formatMxn(payment.amountCents),
                          formatCalendarDate(payment.paidOn),
                          payment.speiReference,
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </td>
              <td className="text-text-dim">{freightCopy.noInvoice}</td>
              <td className="tabular-nums">{formatMxn(row.amount_cents)}</td>
              <td className="whitespace-nowrap text-text-dim">
                {dueLabel(
                  row.due_on,
                  row.terms_days === null
                    ? freightCopy.termsToBeDefined
                    : freightCopy.dueOnAfterDelivery,
                )}
              </td>
              <td className="tabular-nums">{formatMxn(row.paid_cents)}</td>
              <td className="font-semibold tabular-nums">{formatMxn(row.pending_cents)}</td>
              <td>
                <ClientStatusPill status={row.status} />
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
