import {
  adminPanelCopy,
  carrierWebCopy,
  companyFiscalFieldLabels,
  currentOnboardingStep,
  isCarrierStaff,
  managerCompanyCopy,
  onboardingCopy,
  onboardingProfileOf,
  onboardingStepsCopy,
  OPERATOR_ID_REQUIREMENT,
  parseOnboardingStep,
  personTypeOfRfc,
  SELFIE_REQUIREMENT,
  shellCopy,
  splitCompanyProgress,
  verificationStatusLabels,
  verificationSummary,
  type CompanyFiscalColumn,
  type OnboardingStep,
  type StepWork,
} from '@transport/shared';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AppShell } from '@/components/app-shell';
import { CreateBusinessUnitForm } from '@/components/carrier/company-forms';
import { InvitationLinkForm } from '@/components/carrier/invitation-link-form';
import { VehicleForm } from '@/components/carrier/vehicle-form';
import { DocumentUpload } from '@/components/document-upload';
import {
  DocumentStatusList,
  onboardingStepHref,
  OnboardingProgress,
  OnboardingStepNav,
  type StatusGroup,
} from '@/components/onboarding-steps';
import { PageSection } from '@/components/page-section';
import { DetailLayout, DetailRail, RailSection } from '@/components/ui/detail-layout';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import { RequirementList } from '@/components/verification';
import { CompanyContactForm, RequestReviewForm } from '@/components/verification-forms';
import { verificationStatusTone } from '@/lib/status-tones';
import { paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import type { Progress } from '@/lib/verification/queries';
import { loadCompanyVerification } from '@/lib/verification/queries';

const c = shellCopy.review;
const o = onboardingCopy;
const s = onboardingStepsCopy;

export const metadata: Metadata = { title: c.pending_review.title };

/** Upload controls of a requirement list: only missing, rejected or expired documents need one. */
function uploads(
  companyId: string,
  owner: { type: 'company' | 'vehicle' | 'operator'; id: string },
) {
  return ({ requirement, state }: Progress[number]) =>
    (state === 'missing' || state === 'rejected' || state === 'expired') && (
      <DocumentUpload
        companyId={companyId}
        ownerType={owner.type}
        ownerId={owner.id}
        requirementId={requirement.id}
        requiresExpiry={requirement.requires_expiry}
        replacing={state !== 'missing'}
      />
    );
}

/**
 * Steps 3, 4 and 5 of the sign-up (D42, plan-registro.md R3) while the
 * company is not approved, one at a time (`?paso=3|4|5`; without it, the step
 * in course): (3) the common documents, (4) what the profile adds: the
 * shipper's cargo insurance and the note on its loads (D47), the Gerente's
 * business units and coordinators, the hombre-camión's truck and his own
 * documents as its operator (D13), and (5) "En verificación", the state of
 * every document and what to do, with the company's data. The rail keeps the
 * state and how many documents are approved. A Coordinador of a company in
 * review only reads it (the documents are the Gerente's, G1a).
 */
export default async function AccountInReviewPage({
  searchParams,
}: PageProps<'/cuenta-en-revision'>) {
  const viewer = await requireAccess(paths.review);
  const params = await searchParams;
  const supabase = await createClient();
  const verification =
    supabase && viewer.company ? await loadCompanyVerification(supabase, viewer.company.id) : null;
  const company = verification?.company ?? null;
  const readOnly = viewer.role === 'coordinator';
  // The Coordinador reads the steps of the company's own profile.
  const profile =
    onboardingProfileOf(readOnly ? 'manager' : viewer.role, company?.is_owner_operator ?? false) ??
    'shipper';

  const [missingFields, ownOperator, businessUnits] = await Promise.all([
    // Fiscal columns still empty (G2): the admin cannot approve without them.
    supabase && company
      ? supabase
          .rpc('company_missing_fields', { p_company_id: company.id })
          .then(({ data }) => data ?? [])
      : [],
    // The hombre-camión's own operator row (D13), whose documents are his.
    supabase && company && profile === 'owner_operator'
      ? supabase
          .from('operators')
          .select('id')
          .eq('company_id', company.id)
          .eq('profile_id', viewer.userId)
          .is('archived_at', null)
          .maybeSingle()
          .then(({ data }) => data?.id ?? null)
      : null,
    supabase && company && company.type === 'carrier'
      ? supabase
          .from('business_units')
          .select('id, name')
          .eq('company_id', company.id)
          .is('archived_at', null)
          .order('created_at')
          .then(({ data }) => data ?? [])
      : [],
  ]);
  const missingLabels = missingFields
    .map((column) => companyFiscalFieldLabels[column as CompanyFiscalColumn] ?? column)
    .join(', ');

  // requireAccess only lets company staff with a non-approved company through.
  const status = company && company.status !== 'approved' ? company.status : 'pending_review';
  const text = c[status];
  const editable = !readOnly && (status === 'pending_review' || status === 'rejected');
  const owners = verification?.owners ?? [];
  const { common, own } = splitCompanyProgress(owners[0]?.progress ?? []);
  const vehicles = owners.filter((owner) => owner.ownerType === 'vehicle');
  const operatorOwner = owners.find(
    (owner) => owner.ownerType === 'operator' && owner.ownerId === ownOperator,
  );
  const ownerOperator = profile === 'owner_operator';
  const work: StepWork = {
    documents: common,
    profile: ownerOperator
      ? [...own, ...vehicles.flatMap((v) => v.progress), ...(operatorOwner?.progress ?? [])]
      : own,
    profileExtras: ownerOperator ? (vehicles.length === 0 ? 1 : 0) + (operatorOwner ? 0 : 1) : 0,
  };
  const viewed: OnboardingStep | null = parseOnboardingStep(params.paso, profile);
  // Without a valid `?paso=`, the step in course, in the URL: an upload
  // revalidates this same URL, so the step on screen never jumps away.
  if (!viewed) redirect(onboardingStepHref(paths.review, currentOnboardingStep(profile, work)));
  const summary = verificationSummary([...work.documents, ...work.profile]);
  const base = paths.review;
  const description =
    status === 'pending_review' && isCarrierStaff(viewer.role)
      ? readOnly
        ? carrierWebCopy.review.coordinator
        : carrierWebCopy.review.description
      : text.description;

  const rail = (
    <DetailRail>
      <RailSection label={adminPanelCopy.review.status}>
        <Pill tone={verificationStatusTone(status)}>{verificationStatusLabels[status]}</Pill>
      </RailSection>
      <RailSection label={adminPanelCopy.review.documents}>
        <p className="text-numeral text-text tabular-nums">
          {s.summary.counts(summary.approved, summary.total)}
        </p>
        <p className="text-footnote text-text-dim">{summary.message}</p>
      </RailSection>
      {company && status === 'rejected' && !readOnly && viewed === 'verification' && (
        <RailSection label={o.requestReview.title}>
          <p className="text-footnote text-text-dim">{o.requestReview.description}</p>
          <RequestReviewForm />
        </RailSection>
      )}
    </DetailRail>
  );

  // A Coordinador only reads (G1a): no upload controls.
  const upload = (id: string, type: 'company' | 'vehicle' | 'operator') =>
    company && !readOnly ? uploads(company.id, { type, id }) : undefined;

  let body: React.ReactNode = null;
  let nextPrimary = true;
  if (company && viewed === 'documents') {
    body = (
      <PageSection title={s.titles.documents} description={s.descriptions.documents}>
        <RequirementList progress={common} action={upload(company.id, 'company')} />
      </PageSection>
    );
  } else if (company && viewed === 'profile') {
    const parts: React.ReactNode[] = [];
    if (profile === 'shipper') {
      parts.push(
        <RequirementList key="own" progress={own} action={upload(company.id, 'company')} />,
        <Notice key="loads" tone="info">
          {s.shipperLoadsNote}
        </Notice>,
      );
    }
    if (profile === 'manager') {
      parts.push(
        <section key="units" className="space-y-3">
          <h3 className="text-headline text-text">{s.groups.businessUnits}</h3>
          <p className="text-subhead text-text-dim">
            {businessUnits.map((unit) => unit.name).join(' · ')}
          </p>
          {!readOnly && <CreateBusinessUnitForm />}
        </section>,
      );
      if (!readOnly) {
        parts.push(
          <section key="coordinators" className="max-w-xl space-y-3 border bg-cell p-5">
            <h3 className="text-headline text-text">{s.groups.coordinators}</h3>
            <p className="text-subhead text-text-dim">
              {managerCompanyCopy.coordinators.description}
            </p>
            <InvitationLinkForm
              kind="coordinator"
              label={managerCompanyCopy.coordinators.invite}
              units={businessUnits}
              withName
              companyName={company.legal_name}
            />
          </section>,
        );
      }
    }
    if (ownerOperator) {
      parts.push(
        <section key="truck" className="space-y-3">
          <h3 className="text-headline text-text">{s.groups.units}</h3>
          {vehicles.length === 0 ? (
            <>
              <p className="text-subhead text-text-dim">{s.ownerOperator.noUnits}</p>
              {!readOnly && (
                <div className="border bg-cell p-5">
                  <VehicleForm
                    vehicleId={null}
                    initial={{}}
                    features={[]}
                    businessUnits={businessUnits}
                    defaultBusinessUnitId={businessUnits[0]?.id ?? null}
                    returnTo="review"
                  />
                </div>
              )}
            </>
          ) : (
            vehicles.map((vehicle) => (
              <div key={vehicle.ownerId} className="space-y-2">
                <p className="text-subhead font-semibold text-text tabular-nums">{vehicle.label}</p>
                <RequirementList
                  progress={vehicle.progress}
                  action={upload(vehicle.ownerId, 'vehicle')}
                />
              </div>
            ))
          )}
        </section>,
        <section key="personal" className="space-y-3">
          <h3 className="text-headline text-text">{s.groups.personal}</h3>
          {operatorOwner ? (
            <>
              <p className="text-subhead text-text-dim">
                {operatorOwner.progress.some((p) => p.requirement.code === OPERATOR_ID_REQUIREMENT)
                  ? s.sameIdNote
                  : null}{' '}
                {operatorOwner.progress.some((p) => p.requirement.code === SELFIE_REQUIREMENT)
                  ? s.selfieNote
                  : null}
              </p>
              <RequirementList
                progress={operatorOwner.progress}
                action={upload(operatorOwner.ownerId, 'operator')}
              />
            </>
          ) : (
            <Notice tone="attention">{s.ownerOperator.noOperator}</Notice>
          )}
        </section>,
      );
      // Without a truck, its form's "Guardar" is the step's main action.
      nextPrimary = vehicles.length > 0 || readOnly;
    }
    body = (
      <PageSection title={s.titles.profile} description={s.descriptions.profile[profile]}>
        <div className="space-y-8">{parts}</div>
      </PageSection>
    );
  } else if (company) {
    const groups: StatusGroup[] = [
      { key: 'common', title: s.titles.documents, step: 'documents', progress: common },
    ];
    if (own.length > 0) {
      groups.push({ key: 'own', title: s.groups.company, step: 'profile', progress: own });
    }
    if (ownerOperator) {
      for (const vehicle of vehicles) {
        groups.push({
          key: vehicle.ownerId,
          title: `${s.groups.units}: ${vehicle.label}`,
          step: 'profile',
          progress: vehicle.progress,
        });
      }
      if (operatorOwner) {
        groups.push({
          key: operatorOwner.ownerId,
          title: s.groups.personal,
          step: 'profile',
          progress: operatorOwner.progress,
        });
      }
    }
    body = (
      <>
        <PageSection title={s.titles.verification} description={s.descriptions.verification}>
          <Notice tone={summary.todo > 0 ? 'attention' : 'info'}>{summary.message}</Notice>
          {ownerOperator && vehicles.length === 0 && (
            <Notice tone="attention">{s.ownerOperator.noUnits}</Notice>
          )}
          <DocumentStatusList base={base} groups={groups} readOnly={readOnly} />
        </PageSection>
        {missingFields.length > 0 && (
          <Notice tone="attention">
            <strong className="font-semibold">{o.company.missingFiscalTitle}.</strong>{' '}
            {o.company.missingFiscal(missingLabels)}
          </Notice>
        )}
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
    );
  }

  return (
    <AppShell viewer={viewer}>
      <PageHeader title={text.title} description={description} />
      <div className="mb-8">
        <OnboardingProgress base={base} profile={profile} viewed={viewed} work={work} />
      </div>
      <DetailLayout rail={rail}>
        {company?.status_reason && (status === 'rejected' || status === 'suspended') && (
          <Notice tone="error">
            {c.reasonLabel}: {company.status_reason}
          </Notice>
        )}
        {missingFields.length > 0 && viewed !== 'verification' && (
          <Notice tone="attention">
            <strong className="font-semibold">{o.company.missingFiscalTitle}.</strong>{' '}
            {s.missingFiscalElsewhere}
          </Notice>
        )}
        {body}
        <OnboardingStepNav base={base} profile={profile} step={viewed} nextPrimary={nextPrimary} />
      </DetailLayout>
    </AppShell>
  );
}
