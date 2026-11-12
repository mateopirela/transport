import { clientHomeCopy, formatCalendarDate, formatMoney } from '@transport/shared';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { Pill, type PillTone } from '@/components/ui/pill';
import type { AttentionItem } from '@/lib/client/attention';
import { loadPath, negotiationPath, paths, tripPath } from '@/lib/routing';

const c = clientHomeCopy.attention;

/** What one row says and where its action goes. */
function describe(item: AttentionItem): {
  tag: string;
  tone: PillTone;
  title: string;
  detail: string;
  action: string;
  href: string;
} {
  switch (item.kind) {
    case 'offer':
      return {
        tag: c.offer.tag,
        tone: 'attention',
        title: item.route,
        detail: item.carrierName
          ? c.offer.detail(item.carrierName, formatMoney(item.amountCents))
          : formatMoney(item.amountCents),
        action: c.offer.action,
        href: negotiationPath(item.loadId, item.negotiationId),
      };
    case 'quote':
      return {
        tag: c.quote.tag,
        tone: 'attention',
        title: item.route,
        detail: c.quote.detail(formatMoney(item.priceCents)),
        action: c.quote.action,
        href: loadPath(item.loadId),
      };
    case 'delivery':
      return {
        tag: c.delivery.tag,
        tone: 'attention',
        title: item.route ?? '',
        detail: c.delivery.detail,
        action: c.delivery.action,
        href: tripPath(item.tripId),
      };
    case 'overdue':
      return {
        tag: c.overdue.tag,
        tone: 'problem',
        title: item.route,
        detail: item.dueOn
          ? c.overdue.detail(formatMoney(item.pendingCents), formatCalendarDate(item.dueOn))
          : formatMoney(item.pendingCents),
        action: c.overdue.action,
        href: paths.shipperPortfolio,
      };
    case 'draft':
      return {
        tag: c.draft.tag,
        tone: 'inactive',
        title: item.route,
        detail: c.draft.detail,
        action: c.draft.action,
        href: loadPath(item.loadId),
      };
  }
}

/**
 * "Requiere tu atención" (§1.5): one row per thing that waits for the client,
 * its kind as a pill (words, never the colour alone), what it is and the one
 * action that answers it. The actions are outlined: the filled primary of the
 * page is "Publicar una carga".
 */
export function AttentionList({
  items,
  hidden,
}: {
  items: readonly AttentionItem[];
  /** How many more wait beyond those shown. */
  hidden: number;
}) {
  if (items.length === 0) {
    return <Empty variant="plain" title={c.empty} description={c.emptyHelp} className="py-10" />;
  }
  return (
    <>
      <ul className="divide-y divide-separator">
        {items.map((item) => {
          const row = describe(item);
          return (
            <li key={item.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
              <Pill tone={row.tone} className="justify-center sm:w-32">
                {row.tag}
              </Pill>
              <div className="min-w-0 flex-1 basis-56">
                <p className="truncate text-subhead font-semibold text-text">{row.title}</p>
                <p className="text-footnote text-text-dim">{row.detail}</p>
              </div>
              <Link
                href={row.href}
                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
              >
                {row.action}
              </Link>
            </li>
          );
        })}
      </ul>
      {hidden > 0 && (
        <p className="border-t px-5 py-3 text-footnote text-text-dim">{c.more(hidden)}</p>
      )}
    </>
  );
}
