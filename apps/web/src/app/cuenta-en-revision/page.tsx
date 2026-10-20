import {
  carrierWebCopy,
  companyFiscalFieldLabels,
  isCarrierStaff,
  onboardingCopy,
  progressSummary,
  shellCopy,
  type CompanyFiscalColumn,
} from '@transport/shared';
import type { Metadata } from 'next';

import { Check } from 'lucide-react';

import { AppShell } from '@/components/app-shell';
import { Notice } from '@/components/auth-forms';
import { DocumentUpload } from '@/components/document-upload';
import { PageHeader } from '@/components/ui/page-header';
import { RequirementList } from '@/components/verification';
import { CompanyContactForm, RequestReviewForm } from '@/components/verification-forms';
import { paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { loadCompanyVerification } from '@/lib/verification/queries';

const c = shellCopy.review;
const o = onboardingCopy;

export const metadata: Metadata = { title: c.pending_review.title };

type StepState = 'done' | 'current' | 'todo';

function Stepper({ steps }: { steps: { label: string; state: StepState }[] }) {
  return (
    <ol className="mb-8 grid gap-2 sm:grid-cols-3">
      {steps.map((step, index) => (
        <li
          key={step.label}
          aria-current={step.state === 'current' ? 'step' : undefined}
          className={cn(
            'flex min-h-14 items-center gap-3 rounded-2xl border bg-cell px-4 py-2.5',
            step.state === 'current' && 'border-accent',
          )}
        >
          <span
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-full text-footnote font-semibold tabular-nums',
              step.state === 'done' && 'bg-ok/14 text-ok-text',
              step.state === 'current' && 'bg-accent text-accent-ink',
              step.state === 'todo' && 'bg-surface-high text-text-dim',
            )}
          >
            {step.state === 'done' ? <Check aria-hidden className="size-4" /> : index + 1}
          </span>
          <span className="min-w-0">
            <span className="block text-callout font-semibold text-text">{step.label}</span>
            <span className="block text-footnote text-text-dim">
              {step.state === 'done' ? o.stepDone : step.state === 'current' ? o.stepCurrent : ''}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** A section of the page: its title, the line under it, and its content. */
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-1 px-1">
        <h2 className="text-title2 text-text">{title}</h2>
        {description}
      </div>
      {children}
    </section>
  );
}

/**
 * Onboarding (B12) while the company is not approved: company data, upload
 * of the required documents with the state of each one, and review. Since
 * G10a the carrier's Gerente lands here too; a Coordinador only reads it
 * (company documents are the Gerente's, G1a).
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

  return (
    <AppShell viewer={viewer}>
      <div className="mx-auto max-w-3xl">
        <PageHeader title={text.title} description={description} />
        <Stepper
          steps={[
            { label: o.steps.company, state: 'done' },
            { label: o.steps.documents, state: docsDone ? 'done' : 'current' },
            { label: o.steps.review, state: docsDone ? 'current' : 'todo' },
          ]}
        />
        {company?.status_reason && (status === 'rejected' || status === 'suspended') && (
          <Notice tone="error" className="mb-6">
            {c.reasonLabel}: {company.status_reason}
          </Notice>
        )}
        {missingFields.length > 0 && (
          <Notice tone="info" className="mb-6">
            <strong className="font-semibold">{o.company.missingFiscalTitle}.</strong>{' '}
            {o.company.missingFiscal(missingLabels)}
          </Notice>
        )}
        {company && (
          <div className="space-y-10">
            {status === 'rejected' && !readOnly && (
              <Section
                title={o.requestReview.title}
                description={
                  <p className="text-subhead text-text-dim">{o.requestReview.description}</p>
                }
              >
                <RequestReviewForm />
              </Section>
            )}
            <Section
              title={o.documents.title}
              description={
                <>
                  <p className="text-subhead text-text-dim">{o.documents.description}</p>
                  <p className="pt-1 text-subhead font-semibold text-text tabular-nums">
                    {o.documents.progress(summary.approved, summary.required)}
                  </p>
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
            </Section>

            <Section
              title={o.company.title}
              description={
                <p className="text-subhead text-text-dim">
                  {editable ? o.company.description : o.company.readOnly}
                </p>
              }
            >
              <div className="space-y-5 rounded-2xl border bg-cell p-4 sm:p-5">
                <p className="text-callout">
                  <span className="text-text-dim">{o.company.rfc}: </span>
                  <span className="font-semibold text-text">{company.rfc}</span>
                </p>
                {editable && (
                  <CompanyContactForm
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
            </Section>
          </div>
        )}
      </div>
    </AppShell>
  );
}
