import { loadsCopy, shellCopy } from '@transport/shared';

import { AppShell } from '@/components/app-shell';
import { paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';

const nav = [
  { href: paths.shipper, label: loadsCopy.nav.home },
  { href: paths.shipperLoads, label: loadsCopy.nav.loads },
  { href: paths.newLoad, label: loadsCopy.nav.newLoad },
] as const;

/** Shipper area: only shippers whose company is approved. */
export default async function ShipperLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireAccess(paths.shipper);
  return (
    <AppShell area={shellCopy.shipperArea} nav={nav} viewer={viewer}>
      {children}
    </AppShell>
  );
}
