import {
  adminCopy,
  adminPanelCopy,
  formatDateTime,
  uiCopy,
  userRoleLabels,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Pager } from '@/components/pager';
import { Button, buttonVariants } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Search } from '@/components/ui/search';
import { Table, TableCell, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/verification';
import { parsePage, withParams } from '@/lib/pagination';
import { adminCompanyPath, paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

const c = adminCopy.users;
const col = adminCopy.columns;
const PAGE_SIZE = 50;

export const metadata: Metadata = { title: c.title };

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim().slice(0, 100) ?? '';
}

/** User directory: search, status of each user's company and a link to manage it. */
export default async function AdminUsersPage({ searchParams }: PageProps<'/admin/usuarios'>) {
  await requireAccess(paths.adminUsers);
  const params = await searchParams;
  const query = single(params.q);
  const page = parsePage(params.pagina);

  const supabase = await createClient();
  const result = supabase
    ? await supabase.rpc('admin_list_users', {
        p_search: query || undefined,
        p_limit: PAGE_SIZE,
        p_offset: (page - 1) * PAGE_SIZE,
      })
    : null;
  const users = result?.data ?? [];
  const total = users[0]?.total_count ?? 0;
  const pageHref = (n: number) => withParams(paths.adminUsers, { q: query }, { pagina: n });
  const pager = (
    <Pager page={page} pageSize={PAGE_SIZE} shown={users.length} total={total} href={pageHref} />
  );

  return (
    <>
      <PageHeader title={c.title} description={c.description} />
      <form className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3" role="search">
        <Search
          name="q"
          defaultValue={query}
          placeholder={c.searchPlaceholder}
          aria-label={c.search}
          maxLength={100}
          className="w-full max-w-md"
        />
        <Button type="submit" variant="secondary">
          {c.search}
        </Button>
        {result && !result.error && (
          <p className="text-footnote text-text-dim tabular-nums sm:ml-auto">
            {adminPanelCopy.lists.count(total, ...adminPanelCopy.lists.users)}
          </p>
        )}
      </form>

      {!result || result.error ? (
        <Notice tone="error">{adminCopy.errors.loadFailed}</Notice>
      ) : users.length === 0 ? (
        <div className="space-y-3">
          <Empty title={c.empty} />
          {pager}
        </div>
      ) : (
        <div className="space-y-4">
          <Table
            cards
            headers={[
              col.user,
              col.email,
              col.role,
              col.company,
              col.status,
              col.lastSignIn,
              { label: uiCopy.actions, srOnly: true },
            ]}
          >
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell primary>{user.full_name ?? '—'}</TableCell>
                <TableCell label={col.email} className="break-all text-text-dim">
                  {user.email}
                </TableCell>
                <TableCell label={col.role}>{userRoleLabels[user.role]}</TableCell>
                <TableCell label={col.company}>{user.company_legal_name ?? c.noCompany}</TableCell>
                <TableCell label={col.status}>
                  {user.company_status && (
                    <StatusBadge state={user.company_status} kind="verification" />
                  )}
                </TableCell>
                <TableCell
                  label={col.lastSignIn}
                  className="whitespace-nowrap text-text-dim tabular-nums"
                >
                  {user.last_sign_in_at ? formatDateTime(user.last_sign_in_at) : c.never}
                </TableCell>
                <TableCell action>
                  {user.company_id && (
                    <Link
                      href={adminCompanyPath(user.company_id)}
                      className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                    >
                      {c.manage}
                    </Link>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </Table>
          {pager}
        </div>
      )}
    </>
  );
}
