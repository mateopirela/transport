import { cn } from '@/lib/utils';

/**
 * Facts of a load (label over value) in one white group split by hairlines:
 * two columns from a tablet up (`columns={1}` in a side column), the last one
 * spanning both when they are odd. Rows without a value are left out.
 */
export function FactList({
  rows,
  columns = 2,
}: {
  rows: readonly (readonly [string, string | null])[];
  columns?: 1 | 2 | undefined;
}) {
  const facts = rows.filter((row): row is readonly [string, string] => row[1] !== null);
  return (
    <dl
      className={cn(
        'grid gap-px overflow-hidden rounded-2xl border bg-separator',
        columns === 2 && 'sm:grid-cols-2 sm:[&>div:last-child:nth-child(odd)]:col-span-2',
      )}
    >
      {facts.map(([label, value]) => (
        <div key={label} className="space-y-0.5 bg-cell px-4 py-3">
          <dt className="text-footnote text-text-dim">{label}</dt>
          <dd className="text-subhead text-text">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
