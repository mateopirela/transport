import { carrierLoadsCopy, carrierWebCopy, formatDateTime, sortOffers } from '@transport/shared';
import { Handshake } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { carrierNegotiationTone } from '@/lib/carrier/dashboard-summary';
import { loadRoute } from '@/components/carrier/load-details';
import { textLink } from '@/components/page-section';
import { Pager } from '@/components/pager';
import { buttonVariants } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { Money } from '@/components/ui/money';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import { Table, TableCell, TableRow } from '@/components/ui/table';
import { carrierContext } from '@/lib/carrier/context';
import { CARRIER_PAGE_SIZE, listCarrierNegotiations } from '@/lib/carrier/loads';
import { parsePage, withParams } from '@/lib/pagination';
import { carrierNegotiationPath, paths } from '@/lib/routing';

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
      <PageHeader title={c.title} description={c.description} />
      {rows.length === 0 ? (
        total === 0 && (
          <Empty
            icon={Handshake}
            title={c.empty}
            action={
              <Link href={paths.carrierLoads} className={buttonVariants({ variant: 'secondary' })}>
                {carrierLoadsCopy.home.searchAll}
              </Link>
            }
          />
        )
      ) : (
        <Table
          cards
          headers={[
            c.columns.route,
            c.columns.businessUnit,
            { label: c.columns.latest, align: 'right' },
            c.columns.state,
            { label: carrierWebCopy.loads.open, srOnly: true },
          ]}
        >
          {rows.map((row) => {
            const latest = sortOffers(row.offers).at(-1);
            return (
              <TableRow key={row.id}>
                <TableCell primary>
                  {row.load ? (
                    loadRoute(row.load)
                  ) : (
                    <span className="font-normal text-text-dim">{c.unavailableLoad}</span>
                  )}
                </TableCell>
                <TableCell label={c.columns.businessUnit} className="text-text-dim">
                  {unitName.get(row.businessUnitId) ?? ''}
                </TableCell>
                <TableCell label={c.columns.latest} numeric>
                  {latest && (
                    <>
                      <span className="block">
                        <Money cents={latest.amount_cents} /> ·{' '}
                        <span className="font-normal text-text-dim">
                          {carrierWebCopy.offer.side[latest.side]}
                        </span>
                      </span>
                      <span className="block text-meta font-normal text-text-dim">
                        {formatDateTime(latest.created_at)}
                      </span>
                    </>
                  )}
                </TableCell>
                <TableCell label={c.columns.state}>
                  <Pill tone={carrierNegotiationTone(row.state)}>{c.stateLabels[row.state]}</Pill>
                </TableCell>
                <TableCell action>
                  <Link href={carrierNegotiationPath(row.id)} className={textLink}>
                    {c.open}
                  </Link>
                </TableCell>
              </TableRow>
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
