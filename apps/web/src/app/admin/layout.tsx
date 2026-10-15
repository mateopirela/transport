import { adminCopy, shellCopy } from '@transport/shared';

import { AppShell } from '@/components/app-shell';
import { paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';

const NAV = [
  { href: paths.admin, label: adminCopy.nav.home },
  { href: paths.adminQueue, label: adminCopy.nav.queue },
  { href: paths.adminUsers, label: adminCopy.nav.users },
  { href: paths.adminAudit, label: adminCopy.nav.audit },
] as const;

/** Admin area: only `admin` profiles (also checked by the proxy and each page). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireAccess(paths.admin);
  return (
    <AppShell area={shellCopy.adminArea} nav={NAV} viewer={viewer}>
      {children}
    </AppShell>
  );
}
