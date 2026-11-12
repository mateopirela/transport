import {
  brokeredCopy,
  clientListsCopy,
  formatDate,
  loadsCopy,
  unitTypeLabels,
} from '@transport/shared';
import Link from 'next/link';

import { LoadStatusBadge } from '@/components/loads/load-status-badge';
import { Money } from '@/components/ui/money';
import { Table, TableCell, TableRow } from '@/components/ui/table';
import type { ClientLoadListRow } from '@/lib/loads/queries';
import { loadPath } from '@/lib/routing';

import { rowLink } from '@/components/ui/panel';

const c = loadsCopy.list.columns;

/**
 * The client's loads as a table (§1.5): the route (the way into the load),
 * the pickup, the unit, the price on the right and the status as a pill. On a
 * phone each row is a card. A load sent to the platform (I6) shows the
 * client's price once quoted, never the carriers'.
 */
export function LoadsTable({
  rows,
  className,
}: {
  rows: readonly ClientLoadListRow[];
  className?: string;
}) {
  const price = clientListsCopy.loads.price;
  return (
    <Table
      cards
      className={className}
      headers={[c.route, c.pickup, c.unit, { label: price, align: 'right' }, c.status]}
    >
      {rows.map((load) => (
        <TableRow key={load.id}>
          <TableCell primary>
            {/* One block, so the card of a phone keeps the states under the route. */}
            <div>
              <Link href={loadPath(load.id)} className={rowLink}>
                {load.origin_city} → {load.destination_city}
              </Link>
              <span className="block text-footnote font-normal text-text-dim">
                {load.origin_state} · {load.destination_state}
              </span>
            </div>
          </TableCell>
          <TableCell label={c.pickup} className="whitespace-nowrap">
            {formatDate(load.pickup_window_start)}
          </TableCell>
          <TableCell label={c.unit}>{unitTypeLabels[load.unit_type]}</TableCell>
          <TableCell label={price} numeric>
            {load.proposed_price_cents === null ? (
              <span className="font-normal text-text-dim">{brokeredCopy.shipper.toQuote}</span>
            ) : (
              <Money cents={load.proposed_price_cents} />
            )}
          </TableCell>
          <TableCell label={c.status}>
            <LoadStatusBadge status={load.status} quoteStatus={load.brokered_status} />
          </TableCell>
        </TableRow>
      ))}
    </Table>
  );
}
