import { shellCopy } from '@transport/shared';

import { AppShell } from '@/components/app-shell';
import { paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';

/** Admin area: only `admin` profiles (also checked by the proxy and each page). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireAccess(paths.admin);
  return (
    <AppShell area={shellCopy.adminArea} viewer={viewer}>
      {children}
    </AppShell>
  );
}
