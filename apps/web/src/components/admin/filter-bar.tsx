import { adminOpsCopy } from '@transport/shared';
import Link from 'next/link';

import { Button, buttonVariants } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Search } from '@/components/ui/search';
import { Select } from '@/components/ui/select';

const c = adminOpsCopy.filters;

/**
 * GET form of the supervision lists: status and, optionally, a city search.
 * One quiet row over the table: the status (a native select: there are up
 * to ten), the search pill, "Aplicar" and, when something is chosen, "Limpiar".
 */
export function FilterBar({
  action,
  statuses,
  status,
  city,
}: {
  action: string;
  statuses: readonly { value: string; label: string }[];
  status?: string;
  /** Shown only when defined. */
  city?: string;
}) {
  return (
    <form action={action} className="mb-6 flex flex-wrap items-end gap-3" role="search">
      <div className="grid gap-1.5">
        <Label htmlFor="filter-status" className="px-1">
          {c.status}
        </Label>
        <Select
          id="filter-status"
          name="estado"
          defaultValue={status ?? ''}
          className="w-56 max-w-full"
        >
          <option value="">{c.allStatuses}</option>
          {statuses.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
      {city !== undefined && (
        <div className="grid min-w-56 flex-1 gap-1.5 sm:max-w-xs">
          <Label htmlFor="filter-city" className="px-1">
            {c.city}
          </Label>
          <Search
            id="filter-city"
            name="ciudad"
            defaultValue={city}
            placeholder={c.cityPlaceholder}
            maxLength={60}
          />
        </div>
      )}
      <Button type="submit" variant="secondary">
        {c.apply}
      </Button>
      {(status || city) && (
        <Link href={action} className={buttonVariants({ variant: 'plain' })}>
          {c.clear}
        </Link>
      )}
    </form>
  );
}
