import {
  adminBillingCopy,
  adminCopy,
  adminPanelCopy,
  companyDecisions,
  companyFiscalFieldLabels,
  companyTypeLabels,
  documentOwnerTypeLabels,
  fiscalAddressLine,
  formatDate,
  formatDateTime,
  freightCopy,
  planPriceLabel,
  progressSummary,
  subscriptionStatusLabels,
  toMexicoCityDate,
  userRoleLabels,
  uuidField,
  type CompanyFiscalColumn,
  type SubmittedDocument,
} from '@transport/shared';
import { ExternalLink } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CompanyCommissionForm, CompanyTermsForm } from '@/components/freight/admin-freight-forms';
import { BackLink, PageSection, textLink } from '@/components/page-section';
import { ValueRow } from '@/components/ui/cell';
import { DetailLayout, DetailRail, RailSection } from '@/components/ui/detail-layout';
import { Group } from '@/components/ui/group';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import { groupRow } from '@/components/ui/variants';
import { RequirementList, StatusBadge } from '@/components/verification';
import { CompanyReviewForm, DocumentReviewForm } from '@/components/verification-forms';
import { loadBillingState } from '@/lib/billing/queries';
import { adminDocumentFilePath, paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';
import { subscriptionStatusTone } from '@/lib/status-tones';
import { createClient } from '@/lib/supabase/server';
import { loadCompanyVerification } from '@/lib/verification/queries';

const c = adminCopy.company;
const d = adminCopy.document;
const e = adminPanelCopy.companyDetail;

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
    <div id={`doc-${document.id}`} className="scroll-mt-32 space-y-3">
      <a
        href={adminDocumentFilePath(document.id)}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-1 text-subhead ${textLink}`}
      >
        {d.view}
        <ExternalLink aria-hidden className="size-3.5" />
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

/**
 * Admin view of one company in two columns (docs/plan-fulmis.md §1.5): its
 * documents (company, units, operators), each reviewed from a confirmation,
 * its data, subscription and freight terms on the left; on the right the
 * rail with its state, how many required documents are approved and the
 * decision, which asks first too.
 */
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
  // Subscription (H3) and commission override (I3): only carriers have them.
  // The override is not a column clients read: admins get it by RPC.
  const isCarrier = verification.company.type === 'carrier';
  const [billing, commission] = await Promise.all([
    isCarrier ? loadBillingState(supabase, id).catch(() => null) : null,
    isCarrier ? supabase.rpc('admin_company_commission_bps', { p_company_id: id }) : null,
  ]);
  if (commission?.error) throw new Error(`Could not load commission: ${commission.error.message}`);
  if (members.error) throw new Error(`Could not load members: ${members.error.message}`);
  const missingFiscal = (missingFields.data ?? [])
    .map((column) => companyFiscalFieldLabels[column as CompanyFiscalColumn] ?? column)
    .join(', ');
  const { company, owners, unlisted } = verification;
  const [companyOwner, ...fleet] = owners;
  const summary = companyOwner ? progressSummary(companyOwner.progress) : null;
  const missing = summary ? summary.required - summary.approved : 0;
  const address = fiscalAddressLine(company) || '—';
  const contact =
    [company.contact_name, company.contact_email, company.contact_phone]
      .filter(Boolean)
      .join(' · ') || '—';

  const rail = (
    <DetailRail>
      {summary && (
        <RailSection label={e.progressHint}>
          <p className="text-numeral text-text tabular-nums">
            {e.progress(summary.approved, summary.required)}
          </p>
          <p className="text-footnote text-text-dim">{c.missingDocuments(missing)}</p>
        </RailSection>
      )}
      <RailSection label={adminCopy.companyActions.title}>
        {missingFiscal && <Notice tone="error">{c.missingFiscal(missingFiscal)}</Notice>}
        <CompanyReviewForm companyId={company.id} decisions={companyDecisions(company.status)} />
        <p className="text-footnote text-text-dim">{adminCopy.companyActions.approveHint}</p>
      </RailSection>
    </DetailRail>
  );

  return (
    <>
      <BackLink href={paths.adminQueue}>{c.back}</BackLink>
      <PageHeader
        eyebrow={companyTypeLabels[company.type]}
        title={company.legal_name}
        status={<StatusBadge state={company.status} kind="verification" />}
        description={company.rfc}
      />

      <DetailLayout rail={rail}>
        {owners.map((owner) => (
          <PageSection
            key={owner.ownerId}
            title={
              owner === companyOwner
                ? c.companyDocuments
                : `${documentOwnerTypeLabels[owner.ownerType]}: ${owner.label}`
            }
          >
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
          </PageSection>
        ))}
        {unlisted.length > 0 && (
          <PageSection title={c.unlisted} description={c.unlistedHint}>
            <ul className="border bg-cell">
              {unlisted.map((item) => (
                <li key={item.document.id} className={`${groupRow} space-y-3 px-4 py-4`}>
                  <p className="text-headline text-text">
                    {item.requirementName}
                    <span className="ml-2 text-subhead font-normal text-text-dim">
                      {documentOwnerTypeLabels[item.ownerType]}: {item.ownerLabel}
                    </span>
                  </p>
                  <DocumentControls document={item.document} requiresExpiry={item.requiresExpiry} />
                </li>
              ))}
            </ul>
          </PageSection>
        )}
        {company.type === 'carrier' &&
          (!fleet.some((o) => o.ownerType === 'vehicle') ||
            !fleet.some((o) => o.ownerType === 'operator')) && (
            <div className="space-y-1 text-subhead text-text-dim">
              {!fleet.some((o) => o.ownerType === 'vehicle') && <p>{c.noVehicles}</p>}
              {!fleet.some((o) => o.ownerType === 'operator') && <p>{c.noOperators}</p>}
            </div>
          )}

        <Group
          label={c.data}
          footer={
            <Link href={`${paths.adminAudit}?empresa=${company.id}`} className={textLink}>
              {c.audit}
            </Link>
          }
        >
          {company.status_reason && (
            <ValueRow label={c.statusReason}>{company.status_reason}</ValueRow>
          )}
          <ValueRow label={adminCopy.columns.rfc}>
            {company.rfc}
            {company.is_owner_operator && (
              <span className="ml-2 text-text-dim">({c.ownerOperator})</span>
            )}
          </ValueRow>
          <ValueRow label={c.fiscalAddress}>
            <span className="wrap-anywhere">{address}</span>
          </ValueRow>
          <ValueRow label={c.legalRepresentative}>
            {company.legal_representative_name ?? '—'}
          </ValueRow>
          <ValueRow label={c.contact}>
            {/* An email has no spaces: let it break anywhere rather than be clipped. */}
            <span className="wrap-anywhere">{contact}</span>
          </ValueRow>
          <ValueRow label={c.createdAt}>{formatDateTime(company.created_at)}</ValueRow>
          <ValueRow label={c.members}>
            <ul>
              {(members.data ?? []).map((m) => (
                <li key={m.id}>
                  {m.full_name ?? '—'}{' '}
                  <span className="text-text-dim">({userRoleLabels[m.role]})</span>
                </li>
              ))}
            </ul>
          </ValueRow>
        </Group>

        {billing && (
          <Group
            label={adminBillingCopy.companySection}
            footer={
              <Link href={paths.adminSubscriptions} className={textLink}>
                {adminBillingCopy.title}
              </Link>
            }
          >
            <ValueRow label={adminBillingCopy.columns.status}>
              <Pill tone={subscriptionStatusTone(billing.effective_status)}>
                {subscriptionStatusLabels[billing.effective_status]}
              </Pill>
            </ValueRow>
            {billing.stored_status !== billing.effective_status && (
              <ValueRow label={adminBillingCopy.columns.stored}>
                {subscriptionStatusLabels[billing.stored_status]}
              </ValueRow>
            )}
            <ValueRow label={adminBillingCopy.columns.plan}>
              {billing.plan_name ?? '—'} ·{' '}
              {planPriceLabel(billing.plan_amount_cents, billing.plan_interval)}
            </ValueRow>
            {billing.current_period_end && (
              <ValueRow label={adminBillingCopy.columns.periodEnd}>
                {formatDate(billing.current_period_end)}
              </ValueRow>
            )}
          </Group>
        )}

        {/* The freight ledger (I3): the shipper's terms, the carrier's commission. */}
        <Group
          label={freightCopy.admin.title}
          footer={
            <Link href={paths.adminFreight} className={textLink}>
              {freightCopy.admin.title}
            </Link>
          }
        >
          <div className="px-4 py-4">
            {company.type === 'shipper' ? (
              <CompanyTermsForm companyId={company.id} termsDays={company.payment_terms_days} />
            ) : (
              <CompanyCommissionForm
                companyId={company.id}
                commissionBps={commission?.data ?? null}
              />
            )}
          </div>
        </Group>
      </DetailLayout>
    </>
  );
}
