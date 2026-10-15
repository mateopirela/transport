import {
  adminCopy,
  companyTypeLabels,
  documentOwnerTypeLabels,
  formatDateTime,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeading } from '@/components/app-shell';
import { Pager } from '@/components/pager';
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
      <PageHeading title={c.title} description={c.description} />

      <section className="mb-10 space-y-3">
        <h2 className="text-2xl">{c.companies}</h2>
        {companies.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {companyResult.total === 0 && companyPage === 1 ? c.emptyCompanies : ''}
          </p>
        ) : (
          <Table headers={[col.company, col.type, col.rfc, col.since, col.status, '']}>
            {companies.map((company) => (
              <tr key={company.id}>
                <td className="font-medium">{company.legal_name}</td>
                <td>{companyTypeLabels[company.type]}</td>
                <td className="font-mono text-xs">{company.rfc}</td>
                <td className="whitespace-nowrap">{formatDateTime(company.created_at)}</td>
                <td>{c.missing(company.missing)}</td>
                <td>
                  <Link href={adminCompanyPath(company.id)} className="text-accent hover:underline">
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
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl">{c.documents}</h2>
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {documentResult.total === 0 && documentPage === 1 ? c.emptyDocuments : ''}
          </p>
        ) : (
          <Table headers={[col.document, col.owner, col.company, col.since, '']}>
            {documents.map((doc) => (
              <tr key={doc.id}>
                <td className="font-medium">{doc.requirementName}</td>
                <td>
                  <span className="text-muted-foreground">
                    {documentOwnerTypeLabels[doc.ownerType]}:{' '}
                  </span>
                  {doc.ownerName}
                </td>
                <td>{doc.companyName}</td>
                <td className="whitespace-nowrap">{formatDateTime(doc.createdAt)}</td>
                <td>
                  <Link
                    href={`${adminCompanyPath(doc.companyId)}#doc-${doc.id}`}
                    className="text-accent hover:underline"
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
      </section>
    </>
  );
}
