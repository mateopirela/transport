import { shellCopy } from '@transport/shared';

import { AppShell } from '@/components/app-shell';
import { paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';

/** Shipper area: only shippers whose company is approved. */
export default async function ShipperLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireAccess(paths.shipper);
  return (
    <AppShell area={shellCopy.shipperArea} viewer={viewer}>
      {children}
    </AppShell>
  );
}
