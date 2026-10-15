import { adminCopy } from '@transport/shared';
import Link from 'next/link';

const c = adminCopy.pager;

/**
 * Count and previous/next links. An out-of-range page (e.g. after rows left
 * the list) keeps a way back to the first page.
 */
export function Pager({
  page,
  pageSize,
  shown,
  total,
  href,
}: {
  page: number;
  pageSize: number;
  shown: number;
  total: number;
  href: (page: number) => string;
}) {
  if (total <= pageSize && page === 1) return null;
  const first = (page - 1) * pageSize + 1;
  return (
    <div className="flex flex-wrap items-center gap-4 text-sm">
      {shown > 0 ? (
        <span className="text-muted-foreground">{c.range(first, first + shown - 1, total)}</span>
      ) : (
        <Link href={href(1)} className="text-accent hover:underline">
          {c.first}
        </Link>
      )}
      {page > 1 && shown > 0 && (
        <Link href={href(page - 1)} className="text-accent hover:underline">
          {c.previous}
        </Link>
      )}
      {page * pageSize < total && (
        <Link href={href(page + 1)} className="text-accent hover:underline">
          {c.next}
        </Link>
      )}
    </div>
  );
}
