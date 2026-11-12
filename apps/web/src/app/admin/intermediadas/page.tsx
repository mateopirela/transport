import {
  adminPanelCopy,
  brokeredAdminStage,
  brokeredCopy,
  formatDate,
  uiCopy,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { BrokeredStagePill } from '@/components/brokered/brokered-stage-pill';
import { buttonVariants } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { Money } from '@/components/ui/money';
import { PageHeader } from '@/components/ui/page-header';
import { Table, TableCell, TableRow } from '@/components/ui/table';
import { Tag } from '@/components/ui/tag';
import { adminContext } from '@/lib/admin/queries';
import { loadAdminBrokered } from '@/lib/brokered/queries';
import { adminBrokeredPath, paths } from '@/lib/routing';

const c = brokeredCopy.admin;
const l = adminPanelCopy.lists;

export const metadata: Metadata = { title: c.title };

function Price({ cents }: { cents: number | null }) {
  return cents === null ? (
    <span className="text-text-dim">{l.noPrice}</span>
  ) : (
    <Money cents={cents} />
  );
}

/**
 * Admin: the loads clients sent to the platform (I6, D39), in a table. The
 * requests to quote come first; each one opens its prices and the carriers'
 * offers.
 */
export default async function AdminBrokeredPage() {
  const supabase = await adminContext(paths.adminBrokered);
  const rows = await loadAdminBrokered(supabase);
  return (
    <>
      <PageHeader title={c.title} description={c.description} />
      {rows.length === 0 ? (
        <Empty title={c.empty} />
      ) : (
        <Table
          cards
          headers={[
            adminPanelCopy.brokered.route,
            c.shipper,
            c.pickup,
            { label: adminPanelCopy.brokered.clientPrice, align: 'right' },
            { label: adminPanelCopy.brokered.carrierPrice, align: 'right' },
            adminPanelCopy.brokered.stage,
            { label: uiCopy.actions, srOnly: true },
          ]}
        >
          {rows.map((row) => (
            <TableRow key={row.load_id}>
              <TableCell primary>{`${row.origin_city} → ${row.destination_city}`}</TableCell>
              <TableCell label={c.shipper}>{row.shipper_name}</TableCell>
              <TableCell label={c.pickup} className="whitespace-nowrap tabular-nums">
                {formatDate(row.pickup_window_start)}
              </TableCell>
              <TableCell label={adminPanelCopy.brokered.clientPrice} numeric>
                <Price cents={row.client_price_cents} />
              </TableCell>
              <TableCell label={adminPanelCopy.brokered.carrierPrice} numeric>
                <Price cents={row.carrier_price_cents} />
              </TableCell>
              <TableCell label={adminPanelCopy.brokered.stage}>
                <span className="flex flex-wrap items-center gap-2">
                  <BrokeredStagePill
                    stage={brokeredAdminStage(row.quote_status, row.load_status)}
                  />
                  {row.pending_offers > 0 && (
                    <Tag tone="attention">{c.pendingOffers(row.pending_offers)}</Tag>
                  )}
                </span>
              </TableCell>
              <TableCell action>
                <Link
                  href={adminBrokeredPath(row.load_id)}
                  className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                >
                  {adminPanelCopy.brokered.open}
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </Table>
      )}
    </>
  );
}
