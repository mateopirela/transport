import { adminOpsCopy } from '@transport/shared';
import Link from 'next/link';
import type * as React from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Search } from '@/components/ui/search';
import { Select } from '@/components/ui/select';

const c = adminOpsCopy.filters;

/**
 * GET form of the supervision lists (docs/plan-fulmis.md §1.5: filters over
 * the table): the status (a native select: there are up to ten), optionally
 * a city search, "Filtrar" and, when something is chosen, "Quitar filtros";
 * on the right, how many rows match.
 */
export function FilterBar({
  action,
  statuses,
  status,
  city,
  count,
}: {
  action: string;
  statuses: readonly { value: string; label: string }[];
  status?: string;
  /** Shown only when defined. */
  city?: string;
  /** How many rows match, in words ("25 cargas"). */
  count?: React.ReactNode;
}) {
  return (
    <form
      action={action}
      className="mb-6 flex flex-wrap items-end gap-x-3 gap-y-4 border-b pb-6"
      role="search"
    >
      <div className="grid gap-2">
        <Label htmlFor="filter-status">{c.status}</Label>
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
        <div className="grid min-w-56 flex-1 gap-2 sm:max-w-xs">
          <Label htmlFor="filter-city">{c.city}</Label>
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
      {count !== undefined && (
        <p className="flex h-control items-center text-footnote text-text-dim tabular-nums sm:ml-auto">
          {count}
        </p>
      )}
    </form>
  );
}
