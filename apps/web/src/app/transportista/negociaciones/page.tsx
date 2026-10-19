import { carrierWebCopy, formatDateTime, formatMxn, sortOffers } from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeading } from '@/components/app-shell';
import { loadRoute } from '@/components/carrier/load-details';
import { Pager } from '@/components/pager';
import { Table } from '@/components/ui/table';
import { carrierContext } from '@/lib/carrier/context';
import { CARRIER_PAGE_SIZE, listCarrierNegotiations } from '@/lib/carrier/loads';
import { parsePage, withParams } from '@/lib/pagination';
import { carrierNegotiationPath, paths } from '@/lib/routing';
import { cn } from '@/lib/utils';

const c = carrierWebCopy.negotiations;

export const metadata: Metadata = { title: c.title };

/** The company's negotiations of the selected business units, most recent first (G10a). */
export default async function CarrierNegotiationsPage({
  searchParams,
}: PageProps<'/transportista/negociaciones'>) {
  const { supabase, companyId, units } = await carrierContext(paths.carrierNegotiations);
  const page = parsePage((await searchParams).p);
  const { rows, total } = await listCarrierNegotiations(supabase, companyId, {
    businessUnitIds: units.ids,
    page,
  });
  const unitName = new Map(units.operable.map((u) => [u.id, u.name]));

  return (
    <>
      <PageHeading title={c.title} description={c.description} />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{total === 0 ? c.empty : ''}</p>
      ) : (
        <Table
          headers={[
            c.columns.route,
            c.columns.businessUnit,
            c.columns.latest,
            c.columns.state,
            c.columns.actions,
          ]}
        >
          {rows.map((row) => {
            const latest = sortOffers(row.offers).at(-1);
            const attention = row.state === 'respond' || row.state === 'won';
            return (
              <tr key={row.id} className={cn(row.state === 'won' && 'bg-success/5')}>
                <td className="font-medium">
                  {row.load ? (
                    loadRoute(row.load)
                  ) : (
                    <span className="text-muted-foreground">{c.unavailableLoad}</span>
                  )}
                </td>
                <td>{unitName.get(row.businessUnitId) ?? ''}</td>
                <td className="whitespace-nowrap">
                  {latest && (
                    <>
                      <p className="font-medium">
                        {c.lastOffer(
                          formatMxn(latest.amount_cents),
                          carrierWebCopy.offer.side[latest.side],
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(latest.created_at)}
                      </p>
                    </>
                  )}
                </td>
                <td className={cn('whitespace-nowrap', attention && 'font-medium text-accent')}>
                  {c.stateLabels[row.state]}
                </td>
                <td>
                  <Link
                    href={carrierNegotiationPath(row.id)}
                    className="text-accent hover:underline"
                  >
                    {c.open}
                  </Link>
                </td>
              </tr>
            );
          })}
        </Table>
      )}
      <div className="mt-4">
        <Pager
          page={page}
          pageSize={CARRIER_PAGE_SIZE}
          shown={rows.length}
          total={total}
          href={(n) => withParams(paths.carrierNegotiations, {}, { p: n })}
        />
      </div>
    </>
  );
}
