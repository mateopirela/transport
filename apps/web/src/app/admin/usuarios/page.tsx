import { adminCopy, formatDateTime, userRoleLabels } from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeading } from '@/components/app-shell';
import { Notice } from '@/components/auth-forms';
import { Pager } from '@/components/pager';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table } from '@/components/ui/table';
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
      <PageHeading title={c.title} description={c.description} />
      <form className="mb-6 flex max-w-xl gap-2" role="search">
        <Input
          name="q"
          type="search"
          defaultValue={query}
          placeholder={c.searchPlaceholder}
          aria-label={c.search}
          maxLength={100}
        />
        <Button type="submit" variant="outline">
          {c.search}
        </Button>
      </form>

      {!result || result.error ? (
        <Notice tone="error">{adminCopy.errors.loadFailed}</Notice>
      ) : users.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{c.empty}</p>
          {pager}
        </div>
      ) : (
        <>
          <Table
            headers={[col.user, col.email, col.role, col.company, col.status, col.lastSignIn, '']}
          >
            {users.map((user) => (
              <tr key={user.id}>
                <td className="font-medium">{user.full_name ?? '—'}</td>
                <td className="break-all">{user.email}</td>
                <td>{userRoleLabels[user.role]}</td>
                <td>{user.company_legal_name ?? c.noCompany}</td>
                <td>
                  {user.company_status && (
                    <StatusBadge state={user.company_status} kind="verification" />
                  )}
                </td>
                <td className="whitespace-nowrap">
                  {user.last_sign_in_at ? formatDateTime(user.last_sign_in_at) : c.never}
                </td>
                <td>
                  {user.company_id && (
                    <Link
                      href={adminCompanyPath(user.company_id)}
                      className="whitespace-nowrap text-accent hover:underline"
                    >
                      {c.manage}
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </Table>
          <div className="mt-4">{pager}</div>
        </>
      )}
    </>
  );
}
