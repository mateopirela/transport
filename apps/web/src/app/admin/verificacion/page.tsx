import {
  adminCopy,
  adminPanelCopy,
  companyTypeLabels,
  documentOwnerTypeLabels,
  formatDateTime,
  uiCopy,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PageSection } from '@/components/page-section';
import { Pager } from '@/components/pager';
import { buttonVariants } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import { Table, TableCell, TableRow } from '@/components/ui/table';
import { adminCompanyPath, paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { parsePage, withParams } from '@/lib/pagination';
import {
  loadPendingCompanies,
  loadPendingDocuments,
  QUEUE_PAGE_SIZE,
} from '@/lib/verification/admin-queries';

const c = adminCopy.queue;
const col = adminCopy.columns;
const actions = { label: uiCopy.actions, srOnly: true } as const;
const rowLink = buttonVariants({ variant: 'secondary', size: 'sm' });

export const metadata: Metadata = { title: c.title };

/** Verification queue: companies in review and pending documents (B12). */
export default async function VerificationQueuePage({
  searchParams,
}: PageProps<'/admin/verificacion'>) {
  await requireAccess(paths.adminQueue);
  const params = await searchParams;
  // Each list pages on its own: `pe` (empresas) and `pd` (documentos).
  const current = { pe: String(parsePage(params.pe)), pd: String(parsePage(params.pd)) };
  const companyPage = Number(current.pe);
  const documentPage = Number(current.pd);
  const supabase = await createClient();
  const empty = { rows: [], total: 0 };
  const [companyResult, documentResult] = supabase
    ? await Promise.all([
        loadPendingCompanies(supabase, companyPage),
        loadPendingDocuments(supabase, documentPage),
      ])
    : [empty, empty];
  const companies = companyResult.rows;
  const documents = documentResult.rows;

  return (
    <>
      <PageHeader title={c.title} description={c.description} />

      <div className="space-y-12">
        <PageSection
          title={c.companies}
          description={adminPanelCopy.lists.count(
            companyResult.total,
            ...adminPanelCopy.lists.companies,
          )}
        >
          {companies.length === 0 ? (
            companyResult.total === 0 && companyPage === 1 && <Empty title={c.emptyCompanies} />
          ) : (
            <Table cards headers={[col.company, col.type, col.rfc, col.since, col.status, actions]}>
              {companies.map((company) => (
                <TableRow key={company.id}>
                  <TableCell primary>{company.legal_name}</TableCell>
                  <TableCell label={col.type}>{companyTypeLabels[company.type]}</TableCell>
                  <TableCell label={col.rfc} className="text-meta">
                    {company.rfc}
                  </TableCell>
                  <TableCell label={col.since} className="whitespace-nowrap tabular-nums">
                    {formatDateTime(company.created_at)}
                  </TableCell>
                  <TableCell label={col.status}>
                    <Pill tone={company.missing === 0 ? 'done' : 'pending'}>
                      {c.missing(company.missing)}
                    </Pill>
                  </TableCell>
                  <TableCell action>
                    <Link href={adminCompanyPath(company.id)} className={rowLink}>
                      {c.open}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </Table>
          )}
          <Pager
            page={companyPage}
            pageSize={QUEUE_PAGE_SIZE}
            shown={companies.length}
            total={companyResult.total}
            href={(n) => withParams(paths.adminQueue, current, { pe: n })}
          />
        </PageSection>

        <PageSection
          title={c.documents}
          description={adminPanelCopy.lists.count(
            documentResult.total,
            ...adminPanelCopy.lists.documents,
          )}
        >
          {documents.length === 0 ? (
            documentResult.total === 0 && documentPage === 1 && <Empty title={c.emptyDocuments} />
          ) : (
            <Table cards headers={[col.document, col.owner, col.company, col.since, actions]}>
              {documents.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell primary>{doc.requirementName}</TableCell>
                  <TableCell label={col.owner}>
                    <span className="text-text-dim">
                      {documentOwnerTypeLabels[doc.ownerType]}:{' '}
                    </span>
                    {doc.ownerName}
                  </TableCell>
                  <TableCell label={col.company}>{doc.companyName}</TableCell>
                  <TableCell label={col.since} className="whitespace-nowrap tabular-nums">
                    {formatDateTime(doc.createdAt)}
                  </TableCell>
                  <TableCell action>
                    <Link
                      href={`${adminCompanyPath(doc.companyId)}#doc-${doc.id}`}
                      className={rowLink}
                    >
                      {c.open}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </Table>
          )}
          <Pager
            page={documentPage}
            pageSize={QUEUE_PAGE_SIZE}
            shown={documents.length}
            total={documentResult.total}
            href={(n) => withParams(paths.adminQueue, current, { pd: n })}
          />
        </PageSection>
      </div>
    </>
  );
}
