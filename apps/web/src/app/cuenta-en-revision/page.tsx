import {
  carrierWebCopy,
  isCarrierStaff,
  onboardingCopy,
  progressSummary,
  shellCopy,
} from '@transport/shared';
import type { Metadata } from 'next';

import { AppShell, PageHeading } from '@/components/app-shell';
import { Notice } from '@/components/auth-forms';
import { DocumentUpload } from '@/components/document-upload';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
    <ol className="mb-8 grid gap-3 sm:grid-cols-3">
      {steps.map((step, index) => (
        <li
          key={step.label}
          aria-current={step.state === 'current' ? 'step' : undefined}
          className={cn(
            'flex items-center gap-3 rounded-lg border px-4 py-3 text-sm',
            step.state === 'current' && 'border-accent bg-accent/5',
          )}
        >
          <span
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
              step.state === 'done' ? 'bg-success text-white' : 'bg-muted',
              step.state === 'current' && 'bg-accent text-accent-foreground',
            )}
          >
            {index + 1}
          </span>
          <span>
            <span className="block font-medium">{step.label}</span>
            <span className="text-xs text-muted-foreground">
              {step.state === 'done' ? o.stepDone : step.state === 'current' ? o.stepCurrent : ''}
            </span>
          </span>
        </li>
      ))}
    </ol>
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
  // requireAccess only lets company staff with a non-approved company through.
  const status = company && company.status !== 'approved' ? company.status : 'pending_review';
  const text = c[status];
  const progress = verification?.owners[0]?.progress ?? [];
  const summary = progressSummary(progress);
  const readOnly = viewer.role === 'coordinator';
  const editable = !readOnly && (status === 'pending_review' || status === 'rejected');
  const docsDone = summary.needsAction === 0;
  const description =
    status === 'pending_review' && isCarrierStaff(viewer.role)
      ? readOnly
        ? carrierWebCopy.review.coordinator
        : carrierWebCopy.review.description
      : text.description;

  return (
    <AppShell viewer={viewer}>
      <div className="mx-auto max-w-3xl">
        <PageHeading title={text.title} description={description} />
        <Stepper
          steps={[
            { label: o.steps.company, state: 'done' },
            { label: o.steps.documents, state: docsDone ? 'done' : 'current' },
            { label: o.steps.review, state: docsDone ? 'current' : 'todo' },
          ]}
        />
        {company?.status_reason && (status === 'rejected' || status === 'suspended') && (
          <div className="mb-6">
            <Notice tone="error">
              {c.reasonLabel}: {company.status_reason}
            </Notice>
          </div>
        )}
        {company && (
          <div className="space-y-6">
            {status === 'rejected' && !readOnly && (
              <Card>
                <CardHeader>
                  <CardTitle>{o.requestReview.title}</CardTitle>
                  <CardDescription>{o.requestReview.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <RequestReviewForm />
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader>
                <CardTitle>{o.documents.title}</CardTitle>
                <CardDescription>{o.documents.description}</CardDescription>
                <p className="pt-2 text-sm font-medium">
                  {o.documents.progress(summary.approved, summary.required)}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{o.company.title}</CardTitle>
                <CardDescription>
                  {editable ? o.company.description : o.company.readOnly}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm">
                  <span className="text-muted-foreground">{o.company.rfc}: </span>
                  <span className="font-medium">{company.rfc}</span>
                </p>
                {editable && (
                  <CompanyContactForm
                    values={{
                      legalName: company.legal_name,
                      contactName: company.contact_name ?? '',
                      contactEmail: company.contact_email ?? '',
                      contactPhone: company.contact_phone ?? '',
                    }}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  );
}
