import {
  APP_LOCALE,
  carrierWebCopy,
  CITY_PRESETS,
  formatDate,
  formatMxn,
  UNIT_TYPES,
  unitTypeLabels,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeading } from '@/components/app-shell';
import { loadRoute } from '@/components/carrier/load-details';
import { Pager } from '@/components/pager';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Table } from '@/components/ui/table';
import { carrierContext } from '@/lib/carrier/context';
import {
  hasLoadFilters,
  LOAD_FILTER_PARAMS,
  loadFilterParams,
  parseLoadFilters,
} from '@/lib/carrier/filters';
import { CARRIER_PAGE_SIZE, searchLoads } from '@/lib/carrier/loads';
import { parsePage, withParams } from '@/lib/pagination';
import { carrierLoadPath, paths } from '@/lib/routing';

const c = carrierWebCopy.loads;
const kg = new Intl.NumberFormat(APP_LOCALE, { maximumFractionDigits: 0 });
const select = 'h-9 rounded-md border border-input bg-background px-3 text-sm';

export const metadata: Metadata = { title: c.title };

/** Open loads with filters by origin, destination and unit type (G10a; B19 on the app). */
export default async function CarrierLoadsPage({
  searchParams,
}: PageProps<'/transportista/cargas'>) {
  const { supabase } = await carrierContext(paths.carrierLoads);
  const params = await searchParams;
  const filters = parseLoadFilters(params);
  const page = parsePage(params.p);
  const current = { ...loadFilterParams(filters), p: String(page) };
  const { rows, total } = await searchLoads(supabase, filters, page);

  return (
    <>
      <PageHeading title={c.title} description={c.description} />

      <form
        action={paths.carrierLoads}
        className="mb-6 flex flex-wrap items-end gap-3"
        role="search"
      >
        <div className="grid gap-1.5">
          <Label htmlFor="filter-origin">{c.filters.origin}</Label>
          <select
            id="filter-origin"
            name={LOAD_FILTER_PARAMS.origin}
            defaultValue={filters.origin?.id ?? ''}
            className={select}
          >
            <option value="">{c.filters.any}</option>
            {CITY_PRESETS.map((city) => (
              <option key={city.id} value={city.id}>
                {city.city}, {city.state}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="filter-destination">{c.filters.destination}</Label>
          <select
            id="filter-destination"
            name={LOAD_FILTER_PARAMS.destination}
            defaultValue={filters.destination?.id ?? ''}
            className={select}
          >
            <option value="">{c.filters.any}</option>
            {CITY_PRESETS.map((city) => (
              <option key={city.id} value={city.id}>
                {city.city}, {city.state}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="filter-unit-type">{c.filters.unitType}</Label>
          <select
            id="filter-unit-type"
            name={LOAD_FILTER_PARAMS.unitType}
            defaultValue={filters.unitType ?? ''}
            className={select}
          >
            <option value="">{c.filters.any}</option>
            {UNIT_TYPES.map((type) => (
              <option key={type} value={type}>
                {unitTypeLabels[type]}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline">
          {c.filters.apply}
        </Button>
        {hasLoadFilters(filters) && (
          <Link href={paths.carrierLoads} className="py-2 text-sm text-accent hover:underline">
            {c.filters.clear}
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{total === 0 ? c.empty : ''}</p>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted-foreground">{c.results(total)}</p>
          <Table
            headers={[
              c.columns.route,
              c.columns.pickup,
              c.columns.unit,
              c.columns.weight,
              c.columns.price,
              c.columns.actions,
            ]}
          >
            {rows.map((load) => (
              <tr key={load.id}>
                <td className="font-medium">
                  {loadRoute(load)}
                  {load.status === 'negotiating' && (
                    <p className="text-xs font-normal text-muted-foreground">{c.negotiating}</p>
                  )}
                </td>
                <td className="whitespace-nowrap">{formatDate(load.pickup_window_start)}</td>
                <td>{unitTypeLabels[load.unit_type]}</td>
                <td className="whitespace-nowrap">{c.weight(kg.format(load.weight_kg))}</td>
                <td className="whitespace-nowrap">{formatMxn(load.proposed_price_cents)}</td>
                <td>
                  <Link href={carrierLoadPath(load.id)} className="text-accent hover:underline">
                    {c.open}
                  </Link>
                </td>
              </tr>
            ))}
          </Table>
        </>
      )}
      <div className="mt-4">
        <Pager
          page={page}
          pageSize={CARRIER_PAGE_SIZE}
          shown={rows.length}
          total={total}
          href={(n) => withParams(paths.carrierLoads, current, { p: n })}
        />
      </div>
    </>
  );
}
