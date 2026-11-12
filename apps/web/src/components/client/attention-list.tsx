import { clientHomeCopy, formatCalendarDate, formatMoney } from '@transport/shared';

import { AttentionList, type AttentionRow } from '@/components/ui/attention-list';
import { Empty } from '@/components/ui/empty';
import type { AttentionItem } from '@/lib/client/attention';
import { loadPath, negotiationPath, paths, tripPath } from '@/lib/routing';

const c = clientHomeCopy.attention;

/** What one row says and where its action goes. */
function describe(item: AttentionItem): Omit<AttentionRow, 'key'> {
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
 * "Requiere tu atención" of the client (§1.5), on the list of the kit: one row
 * per thing that waits for the client. The actions are outlined: the filled
 * primary of the page is "Publicar una carga".
 */
export function ShipperAttention({
  items,
  hidden,
}: {
  items: readonly AttentionItem[];
  /** How many more wait beyond those shown. */
  hidden: number;
}) {
  return (
    <AttentionList
      rows={items.map((item) => ({ key: item.key, ...describe(item) }))}
      empty={<Empty variant="plain" title={c.empty} description={c.emptyHelp} className="py-10" />}
      footer={hidden > 0 ? c.more(hidden) : undefined}
    />
  );
}
