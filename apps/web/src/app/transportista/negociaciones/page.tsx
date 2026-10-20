import { carrierWebCopy, formatDateTime, formatMxn, sortOffers } from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { loadRoute } from '@/components/carrier/load-details';
import { textLink } from '@/components/page-section';
import { Pager } from '@/components/pager';
import { Empty } from '@/components/ui/empty';
import { PageHeader } from '@/components/ui/page-header';
import { Pill, type PillTone } from '@/components/ui/pill';
import { Table } from '@/components/ui/table';
import { carrierContext } from '@/lib/carrier/context';
import { CARRIER_PAGE_SIZE, listCarrierNegotiations } from '@/lib/carrier/loads';
import { parsePage, withParams } from '@/lib/pagination';
import { carrierNegotiationPath, paths } from '@/lib/routing';

const c = carrierWebCopy.negotiations;

export const metadata: Metadata = { title: c.title };

/** The state's pill: the accent when it is the carrier's turn, green when won. */
function stateTone(state: keyof typeof c.stateLabels): PillTone {
  if (state === 'won') return 'ok';
  if (state === 'respond') return 'accent';
  return 'neutral';
}

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
        total === 0 && <Empty title={c.empty} />
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
            return (
              <tr key={row.id}>
                <td className="font-semibold">
                  {row.load ? (
                    loadRoute(row.load)
                  ) : (
                    <span className="font-normal text-text-dim">{c.unavailableLoad}</span>
                  )}
                </td>
                <td className="text-text-dim">{unitName.get(row.businessUnitId) ?? ''}</td>
                <td className="whitespace-nowrap">
                  {latest && (
                    <>
                      <p className="tabular-nums">
                        {c.lastOffer(
                          formatMxn(latest.amount_cents),
                          carrierWebCopy.offer.side[latest.side],
                        )}
                      </p>
                      <p className="text-footnote text-text-dim tabular-nums">
                        {formatDateTime(latest.created_at)}
                      </p>
                    </>
                  )}
                </td>
                <td>
                  <Pill tone={stateTone(row.state)}>{c.stateLabels[row.state]}</Pill>
                </td>
                <td>
                  <Link href={carrierNegotiationPath(row.id)} className={textLink}>
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
