import { adminOpsCopy } from '@transport/shared';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const c = adminOpsCopy.filters;

/** GET form of the supervision lists: status and, optionally, a city search. */
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
        <Label htmlFor="filter-status">{c.status}</Label>
        <select
          id="filter-status"
          name="estado"
          defaultValue={status ?? ''}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">{c.allStatuses}</option>
          {statuses.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {city !== undefined && (
        <div className="grid min-w-56 flex-1 gap-1.5 sm:max-w-xs">
          <Label htmlFor="filter-city">{c.city}</Label>
          <Input
            id="filter-city"
            name="ciudad"
            type="search"
            defaultValue={city}
            placeholder={c.cityPlaceholder}
            maxLength={60}
          />
        </div>
      )}
      <Button type="submit" variant="outline">
        {c.apply}
      </Button>
      {(status || city) && (
        <Link href={action} className="py-2 text-sm text-accent hover:underline">
          {c.clear}
        </Link>
      )}
    </form>
  );
}
