import {
  adminCopy,
  companyDecisions,
  companyFiscalFieldLabels,
  companyTypeLabels,
  documentOwnerTypeLabels,
  formatDateTime,
  progressSummary,
  toMexicoCityDate,
  userRoleLabels,
  uuidField,
  type CompanyFiscalColumn,
  type SubmittedDocument,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PageHeading } from '@/components/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RequirementList, StatusBadge } from '@/components/verification';
import { CompanyReviewForm, DocumentReviewForm } from '@/components/verification-forms';
import { adminDocumentFilePath, paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { loadCompanyVerification } from '@/lib/verification/queries';

const c = adminCopy.company;
const d = adminCopy.document;

export const metadata: Metadata = { title: adminCopy.queue.title };

/** File link and, while pending, the review form; anchored for links from the queue. */
function DocumentControls({
  document,
  requiresExpiry,
}: {
  document: SubmittedDocument;
  requiresExpiry: boolean;
}) {
  return (
    <div id={`doc-${document.id}`} className="scroll-mt-24 space-y-3">
      <a
        href={adminDocumentFilePath(document.id)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-accent hover:underline"
      >
        {d.view} ↗
      </a>
      {document.status === 'pending_review' && (
        <DocumentReviewForm
          documentId={document.id}
          requiresExpiry={requiresExpiry}
          expiresOn={document.expires_at ? toMexicoCityDate(document.expires_at) : undefined}
        />
      )}
    </div>
  );
}

/** Admin view of one company: data, documents (company, units, operators) and decisions. */
export default async function AdminCompanyPage({ params }: PageProps<'/admin/empresas/[id]'>) {
  const { id } = await params;
  await requireAccess(paths.admin);
  if (!uuidField.safeParse(id).success) notFound();
  const supabase = await createClient();
  if (!supabase) notFound();
  const [verification, members, missingFields] = await Promise.all([
    loadCompanyVerification(supabase, id),
    supabase.from('profiles').select('id, full_name, role').eq('company_id', id),
    supabase.rpc('company_missing_fields', { p_company_id: id }),
  ]);
  if (!verification) notFound();
  if (members.error) throw new Error(`Could not load members: ${members.error.message}`);
  const missingFiscal = (missingFields.data ?? [])
    .map((column) => companyFiscalFieldLabels[column as CompanyFiscalColumn] ?? column)
    .join(', ');
  const { company, owners, unlisted } = verification;
  const [companyOwner, ...fleet] = owners;
  const summary = companyOwner ? progressSummary(companyOwner.progress) : null;
  const missing = summary ? summary.required - summary.approved : 0;

  return (
    <>
      <Link
        href={paths.adminQueue}
        className="mb-4 inline-block text-sm text-accent hover:underline"
      >
        ← {c.back}
      </Link>
      <PageHeading title={company.legal_name} />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-8">
          {owners.map((owner) => (
            <section key={owner.ownerId} className="space-y-3">
              <h2 className="text-xl">
                {owner === companyOwner
                  ? c.companyDocuments
                  : `${documentOwnerTypeLabels[owner.ownerType]}: ${owner.label}`}
              </h2>
              <RequirementList
                progress={owner.progress}
                action={({ requirement, document }) =>
                  document && (
                    <DocumentControls
                      document={document}
                      requiresExpiry={requirement.requires_expiry}
                    />
                  )
                }
              />
            </section>
          ))}
          {unlisted.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xl">{c.unlisted}</h2>
              <p className="text-sm text-muted-foreground">{c.unlistedHint}</p>
              <ul className="divide-y rounded-lg border">
                {unlisted.map((item) => (
                  <li key={item.document.id} className="space-y-3 p-4">
                    <p className="font-medium">
                      {item.requirementName}
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        {documentOwnerTypeLabels[item.ownerType]}: {item.ownerLabel}
                      </span>
                    </p>
                    <DocumentControls
                      document={item.document}
                      requiresExpiry={item.requiresExpiry}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {company.type === 'carrier' && (
            <>
              {!fleet.some((o) => o.ownerType === 'vehicle') && (
                <p className="text-sm text-muted-foreground">{c.noVehicles}</p>
              )}
              {!fleet.some((o) => o.ownerType === 'operator') && (
                <p className="text-sm text-muted-foreground">{c.noOperators}</p>
              )}
            </>
          )}
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">{c.data}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">{adminCopy.columns.status}</dt>
                  <dd className="pt-1">
                    <StatusBadge state={company.status} kind="verification" />
                  </dd>
                </div>
                {company.status_reason && (
                  <div>
                    <dt className="text-muted-foreground">{c.statusReason}</dt>
                    <dd>{company.status_reason}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-muted-foreground">{adminCopy.columns.type}</dt>
                  <dd>{companyTypeLabels[company.type]}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{adminCopy.columns.rfc}</dt>
                  <dd className="font-mono">
                    {company.rfc}
                    {company.is_owner_operator && (
                      <span className="ml-2 font-sans text-muted-foreground">
                        ({c.ownerOperator})
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{c.fiscalAddress}</dt>
                  <dd>
                    {[
                      [
                        company.fiscal_street,
                        company.fiscal_exterior_number,
                        company.fiscal_interior_number,
                      ]
                        .filter(Boolean)
                        .join(' '),
                      company.fiscal_neighborhood,
                      company.fiscal_postal_code,
                      company.fiscal_municipality,
                      company.fiscal_state,
                    ]
                      .filter(Boolean)
                      .join(', ') || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{c.legalRepresentative}</dt>
                  <dd>{company.legal_representative_name ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{c.contact}</dt>
                  <dd>
                    {[company.contact_name, company.contact_email, company.contact_phone]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{c.createdAt}</dt>
                  <dd>{formatDateTime(company.created_at)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{c.members}</dt>
                  <dd>
                    <ul>
                      {(members.data ?? []).map((m) => (
                        <li key={m.id}>
                          {m.full_name ?? '—'}{' '}
                          <span className="text-muted-foreground">({userRoleLabels[m.role]})</span>
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl">{adminCopy.companyActions.title}</CardTitle>
              <p className="text-sm text-muted-foreground">{c.missingDocuments(missing)}</p>
              {missingFiscal && (
                <p className="text-sm text-destructive">{c.missingFiscal(missingFiscal)}</p>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <CompanyReviewForm
                companyId={company.id}
                decisions={companyDecisions(company.status)}
              />
              <p className="text-xs text-muted-foreground">
                {adminCopy.companyActions.approveHint}
              </p>
            </CardContent>
          </Card>

          <Link
            href={`${paths.adminAudit}?empresa=${company.id}`}
            className="inline-block text-sm text-accent hover:underline"
          >
            {c.audit}
          </Link>
        </aside>
      </div>
    </>
  );
}
