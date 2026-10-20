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

import { loadRoute } from '@/components/carrier/load-details';
import { textLink } from '@/components/page-section';
import { Pager } from '@/components/pager';
import { Button, buttonVariants } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import { Select } from '@/components/ui/select';
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

export const metadata: Metadata = { title: c.title };

/** One filter of the bar: its label over a native select. */
function FilterSelect({
  id,
  label,
  name,
  value,
  options,
}: {
  id: string;
  label: string;
  name: string;
  value: string;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="px-1">
        {label}
      </Label>
      <Select id={id} name={name} defaultValue={value} className="w-56 max-w-full">
        <option value="">{c.filters.any}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

const CITIES = CITY_PRESETS.map((city) => ({
  value: city.id,
  label: `${city.city}, ${city.state}`,
}));
const TYPES = UNIT_TYPES.map((type) => ({ value: type, label: unitTypeLabels[type] }));

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
      <PageHeader title={c.title} description={c.description} />

      <form
        action={paths.carrierLoads}
        className="mb-6 flex flex-wrap items-end gap-3"
        role="search"
      >
        <FilterSelect
          id="filter-origin"
          label={c.filters.origin}
          name={LOAD_FILTER_PARAMS.origin}
          value={filters.origin?.id ?? ''}
          options={CITIES}
        />
        <FilterSelect
          id="filter-destination"
          label={c.filters.destination}
          name={LOAD_FILTER_PARAMS.destination}
          value={filters.destination?.id ?? ''}
          options={CITIES}
        />
        <FilterSelect
          id="filter-unit-type"
          label={c.filters.unitType}
          name={LOAD_FILTER_PARAMS.unitType}
          value={filters.unitType ?? ''}
          options={TYPES}
        />
        <Button type="submit" variant="secondary">
          {c.filters.apply}
        </Button>
        {hasLoadFilters(filters) && (
          <Link href={paths.carrierLoads} className={buttonVariants({ variant: 'plain' })}>
            {c.filters.clear}
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        total === 0 && <Empty title={c.empty} />
      ) : (
        <>
          <p className="mb-2 px-1 text-footnote text-text-dim tabular-nums">{c.results(total)}</p>
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
                <td>
                  <span className="font-semibold text-text">{loadRoute(load)}</span>
                  {load.status === 'negotiating' && (
                    <Pill tone="accent" className="ml-2">
                      {c.negotiating}
                    </Pill>
                  )}
                </td>
                <td className="whitespace-nowrap tabular-nums">
                  {formatDate(load.pickup_window_start)}
                </td>
                <td>{unitTypeLabels[load.unit_type]}</td>
                <td className="whitespace-nowrap tabular-nums">
                  {c.weight(kg.format(load.weight_kg))}
                </td>
                <td className="whitespace-nowrap font-semibold tabular-nums">
                  {formatMxn(load.proposed_price_cents)}
                </td>
                <td>
                  <Link href={carrierLoadPath(load.id)} className={textLink}>
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
