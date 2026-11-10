import { brokeredAdminStage, brokeredCopy, formatDate, formatMxn } from '@transport/shared';
import type { Metadata } from 'next';

import { BrokeredStagePill } from '@/components/brokered/brokered-stage-pill';
import { Cell } from '@/components/ui/cell';
import { Empty } from '@/components/ui/empty';
import { Group } from '@/components/ui/group';
import { PageHeader } from '@/components/ui/page-header';
import { adminContext } from '@/lib/admin/queries';
import { loadAdminBrokered } from '@/lib/brokered/queries';
import { adminBrokeredPath, paths } from '@/lib/routing';

const c = brokeredCopy.admin;

export const metadata: Metadata = { title: c.title };

const price = (cents: number | null) => (cents === null ? '—' : formatMxn(cents));

/**
 * Admin: the loads clients sent to the platform (I6, D39). The requests to
 * quote come first; each one opens its prices and the carriers' offers.
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
        <Group className="max-w-4xl">
          {rows.map((row) => (
            <Cell
              key={row.load_id}
              href={adminBrokeredPath(row.load_id)}
              title={`${row.origin_city} → ${row.destination_city}`}
              subtitle={[
                row.shipper_name,
                `${c.pickup} ${formatDate(row.pickup_window_start)}`,
                `${c.clientPrice}: ${price(row.client_price_cents)}`,
                `${c.carrierPrice}: ${price(row.carrier_price_cents)}`,
                ...(row.pending_offers > 0 ? [c.pendingOffers(row.pending_offers)] : []),
              ].join(' · ')}
              trailing={
                <BrokeredStagePill stage={brokeredAdminStage(row.quote_status, row.load_status)} />
              }
            />
          ))}
        </Group>
      )}
    </>
  );
}
