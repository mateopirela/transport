import {
  adminPanelCopy,
  carrierWebCopy,
  companyFiscalFieldLabels,
  isCarrierStaff,
  onboardingCopy,
  personTypeOfRfc,
  progressSummary,
  shellCopy,
  verificationStatusLabels,
  type CompanyFiscalColumn,
} from '@transport/shared';
import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell';
import { DocumentUpload } from '@/components/document-upload';
import { PageSection } from '@/components/page-section';
import { DetailLayout, DetailRail, RailSection } from '@/components/ui/detail-layout';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import { Steps, type Step } from '@/components/ui/steps';
import { RequirementList } from '@/components/verification';
import { CompanyContactForm, RequestReviewForm } from '@/components/verification-forms';
import { verificationStatusTone } from '@/lib/status-tones';
import { paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { loadCompanyVerification } from '@/lib/verification/queries';

const c = shellCopy.review;
const o = onboardingCopy;

export const metadata: Metadata = { title: c.pending_review.title };

/**
 * Onboarding (B12) while the company is not approved, in two columns
 * (docs/plan-fulmis.md §1.5): the required documents, each with its state and
 * its upload, and the company's data on the left; on the right the rail with
 * the state, how many documents are approved, the three steps and, after a
 * rejection, "Solicitar revisión". Since G10a the carrier's Gerente lands
 * here too; a Coordinador only reads it (company documents are the
 * Gerente's, G1a).
 */
export default async function AccountInReviewPage() {
  const viewer = await requireAccess(paths.review);
  const supabase = await createClient();
  const verification =
    supabase && viewer.company ? await loadCompanyVerification(supabase, viewer.company.id) : null;
  const company = verification?.company ?? null;
  // Fiscal columns still empty (G2): the admin cannot approve without them.
  const missingFields =
    supabase && company
      ? ((await supabase.rpc('company_missing_fields', { p_company_id: company.id })).data ?? [])
      : [];
  const missingLabels = missingFields
    .map((column) => companyFiscalFieldLabels[column as CompanyFiscalColumn] ?? column)
    .join(', ');
  // requireAccess only lets company staff with a non-approved company through.
  const status = company && company.status !== 'approved' ? company.status : 'pending_review';
  const text = c[status];
  const progress = verification?.owners[0]?.progress ?? [];
  const summary = progressSummary(progress);
  const readOnly = viewer.role === 'coordinator';
  const editable = !readOnly && (status === 'pending_review' || status === 'rejected');
  const docsDone = summary.needsAction === 0 && missingFields.length === 0;
  const description =
    status === 'pending_review' && isCarrierStaff(viewer.role)
      ? readOnly
        ? carrierWebCopy.review.coordinator
        : carrierWebCopy.review.description
      : text.description;

  const steps: Step[] = [
    { label: o.steps.company, state: 'done' },
    { label: o.steps.documents, state: docsDone ? 'done' : 'current' },
    { label: o.steps.review, state: docsDone ? 'current' : 'upcoming' },
  ];

  const rail = (
    <DetailRail>
      <RailSection label={adminPanelCopy.review.status}>
        <Pill tone={verificationStatusTone(status)}>{verificationStatusLabels[status]}</Pill>
      </RailSection>
      <RailSection label={adminPanelCopy.review.documents}>
        <p className="text-numeral text-text tabular-nums">
          {adminPanelCopy.companyDetail.progress(summary.approved, summary.required)}
        </p>
        <p className="text-footnote text-text-dim">{adminPanelCopy.review.documentsHint}</p>
      </RailSection>
      <RailSection label={adminPanelCopy.review.steps}>
        <Steps steps={steps} label={adminPanelCopy.review.steps} />
      </RailSection>
      {company && status === 'rejected' && !readOnly && (
        <RailSection label={o.requestReview.title}>
          <p className="text-footnote text-text-dim">{o.requestReview.description}</p>
          <RequestReviewForm />
        </RailSection>
      )}
    </DetailRail>
  );

  return (
    <AppShell viewer={viewer}>
      <PageHeader title={text.title} description={description} />
      <DetailLayout rail={rail}>
        {company?.status_reason && (status === 'rejected' || status === 'suspended') && (
          <Notice tone="error">
            {c.reasonLabel}: {company.status_reason}
          </Notice>
        )}
        {missingFields.length > 0 && (
          <Notice tone="attention">
            <strong className="font-semibold">{o.company.missingFiscalTitle}.</strong>{' '}
            {o.company.missingFiscal(missingLabels)}
          </Notice>
        )}
        {company && (
          <>
            <PageSection
              title={o.documents.title}
              description={
                <>
                  {o.documents.description}{' '}
                  <span className="font-semibold text-text tabular-nums">
                    {o.documents.progress(summary.approved, summary.required)}
                  </span>
                </>
              }
            >
              <div className="space-y-4">
                {docsDone && summary.approved < summary.required && (
                  <Notice tone="info">{o.documents.allSent}</Notice>
                )}
                <RequirementList
                  progress={progress}
                  action={({ requirement, state }) =>
                    // Only missing, rejected or expired documents need a (new) upload;
                    // a pending one waits for the admin. A Coordinador only reads.
                    !readOnly &&
                    (state === 'missing' || state === 'rejected' || state === 'expired') && (
                      <DocumentUpload
                        companyId={company.id}
                        ownerType="company"
                        ownerId={company.id}
                        requirementId={requirement.id}
                        requiresExpiry={requirement.requires_expiry}
                        replacing={state !== 'missing'}
                      />
                    )
                  }
                />
              </div>
            </PageSection>

            <PageSection
              title={o.company.title}
              description={editable ? o.company.description : o.company.readOnly}
            >
              <div className="space-y-5 border bg-cell p-5">
                <p className="text-callout">
                  <span className="text-text-dim">{o.company.rfc}: </span>
                  <span className="font-semibold text-text">{company.rfc}</span>
                </p>
                {editable && (
                  <CompanyContactForm
                    personType={personTypeOfRfc(company.rfc)}
                    values={{
                      legalName: company.legal_name,
                      contactName: company.contact_name ?? '',
                      contactEmail: company.contact_email ?? '',
                      contactPhone: company.contact_phone ?? '',
                      fiscalStreet: company.fiscal_street ?? '',
                      fiscalExteriorNumber: company.fiscal_exterior_number ?? '',
                      fiscalInteriorNumber: company.fiscal_interior_number ?? '',
                      fiscalNeighborhood: company.fiscal_neighborhood ?? '',
                      fiscalPostalCode: company.fiscal_postal_code ?? '',
                      fiscalMunicipality: company.fiscal_municipality ?? '',
                      fiscalState: company.fiscal_state ?? '',
                      legalRepresentativeName: company.legal_representative_name ?? '',
                    }}
                  />
                )}
              </div>
            </PageSection>
          </>
        )}
      </DetailLayout>
    </AppShell>
  );
}
