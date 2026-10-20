import {
  adminCopy,
  companyTypeLabels,
  documentOwnerTypeLabels,
  formatDateTime,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PageSection, textLink } from '@/components/page-section';
import { Pager } from '@/components/pager';
import { Empty } from '@/components/ui/empty';
import { PageHeader } from '@/components/ui/page-header';
import { Table } from '@/components/ui/table';
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
        <PageSection title={c.companies}>
          {companies.length === 0 ? (
            companyResult.total === 0 && companyPage === 1 && <Empty title={c.emptyCompanies} />
          ) : (
            <Table headers={[col.company, col.type, col.rfc, col.since, col.status, '']}>
              {companies.map((company) => (
                <tr key={company.id}>
                  <td className="font-semibold">{company.legal_name}</td>
                  <td>{companyTypeLabels[company.type]}</td>
                  <td className="tabular-nums">{company.rfc}</td>
                  <td className="whitespace-nowrap tabular-nums">
                    {formatDateTime(company.created_at)}
                  </td>
                  <td className="text-text-dim">{c.missing(company.missing)}</td>
                  <td>
                    <Link href={adminCompanyPath(company.id)} className={textLink}>
                      {c.open}
                    </Link>
                  </td>
                </tr>
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

        <PageSection title={c.documents}>
          {documents.length === 0 ? (
            documentResult.total === 0 && documentPage === 1 && <Empty title={c.emptyDocuments} />
          ) : (
            <Table headers={[col.document, col.owner, col.company, col.since, '']}>
              {documents.map((doc) => (
                <tr key={doc.id}>
                  <td className="font-semibold">{doc.requirementName}</td>
                  <td>
                    <span className="text-text-dim">
                      {documentOwnerTypeLabels[doc.ownerType]}:{' '}
                    </span>
                    {doc.ownerName}
                  </td>
                  <td>{doc.companyName}</td>
                  <td className="whitespace-nowrap tabular-nums">
                    {formatDateTime(doc.createdAt)}
                  </td>
                  <td>
                    <Link
                      href={`${adminCompanyPath(doc.companyId)}#doc-${doc.id}`}
                      className={textLink}
                    >
                      {c.open}
                    </Link>
                  </td>
                </tr>
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
