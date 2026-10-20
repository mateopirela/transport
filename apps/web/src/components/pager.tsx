import { adminCopy } from '@transport/shared';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';

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
  const link = buttonVariants({ variant: 'secondary', size: 'sm' });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {shown > 0 ? (
        <span className="mr-auto px-1 text-footnote text-text-dim tabular-nums">
          {c.range(first, first + shown - 1, total)}
        </span>
      ) : (
        <Link href={href(1)} className={link}>
          {c.first}
        </Link>
      )}
      {page > 1 && shown > 0 && (
        <Link href={href(page - 1)} className={link}>
          {c.previous}
        </Link>
      )}
      {page * pageSize < total && (
        <Link href={href(page + 1)} className={link}>
          {c.next}
        </Link>
      )}
    </div>
  );
}
