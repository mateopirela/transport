import { carrierWebCopy, fleetCopy, formatDate, managerCompanyCopy } from '@transport/shared';
import type { Metadata } from 'next';

import { MoveForm } from '@/components/carrier/company-forms';
import { FleetArchiveForm } from '@/components/carrier/fleet-archive-form';
import { FleetDocuments } from '@/components/carrier/fleet-documents';
import { InvitationLinkForm } from '@/components/carrier/invitation-link-form';
import { OperatorForm } from '@/components/carrier/operator-form';
import { BackLink, PageSection } from '@/components/page-section';
import { DetailLayout, DetailRail, RailSection } from '@/components/ui/detail-layout';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import { carrierContext } from '@/lib/carrier/context';
import { getCarrierOperator, loadFleetContext } from '@/lib/carrier/fleet';
import { operatorFormValues, parseFleetFlash } from '@/lib/carrier/fleet-forms';
import { carrierOperatorPath, paths } from '@/lib/routing';

const c = carrierWebCopy.fleet;

export const metadata: Metadata = { title: fleetCopy.operators.editTitle };

/**
 * One operator of the fleet (G10b; B18 on the app): its data and license
 * (editable by the Gerente and the Coordinador of its business unit), its
 * invitation link or, once it has an account, "Restablecer acceso" (G4), its
 * D16 documents and, for the Gerente, moving it and the archive. Saving the
 * data is the screen's primary; the side column's actions are secondary.
 */
export default async function CarrierOperatorPage({
  params,
  searchParams,
}: PageProps<'/transportista/flota/operadores/[id]'>) {
  const { id } = await params;
  const { supabase, viewer, companyId, isManager, units } = await carrierContext(
    carrierOperatorPath(id),
  );
  const companyName = viewer.company?.legalName ?? '';
  const flash = parseFleetFlash((await searchParams).aviso);
  const context = await loadFleetContext(supabase, companyId);
  const operator = await getCarrierOperator(supabase, context, id);
  const back = <BackLink href={paths.carrierOperators}>{c.operators.back}</BackLink>;
  if (!operator) {
    return (
      <>
        {back}
        <Notice tone="info">{c.operators.notFound}</Notice>
      </>
    );
  }
  const account = operator.profile_id
    ? fleetCopy.operators.linked
    : operator.invitation
      ? fleetCopy.operators.invited(formatDate(operator.invitation.expires_at))
      : fleetCopy.operators.notInvited;
  const accountTone = operator.profile_id ? 'done' : operator.invitation ? 'pending' : 'inactive';

  return (
    <>
      {back}
      <PageHeader
        title={operator.full_name}
        status={<Pill tone={accountTone}>{account}</Pill>}
        description={
          operator.businessUnitName ? fleetCopy.businessUnit(operator.businessUnitName) : undefined
        }
      />
      {flash === 'alta' && (
        <Notice tone="success" className="mb-8">
          {c.operators.created}
        </Notice>
      )}

      <DetailLayout
        rail={
          <div className="space-y-6">
            <DetailRail>
              {!operator.profile_id ? (
                <RailSection label={fleetCopy.invitation.title}>
                  <p className="text-subhead text-text-dim">{fleetCopy.invitation.subtitle}</p>
                  <InvitationLinkForm
                    kind="operator"
                    label={fleetCopy.invitation.create}
                    operatorId={operator.id}
                    companyName={companyName}
                  />
                </RailSection>
              ) : operator.profile_id !== viewer.userId ? (
                // A hombre-camión's own row is a manager account: never reset (G2).
                <RailSection label={fleetCopy.invitation.title}>
                  <div className="space-y-0.5">
                    <h3 className="text-headline text-text">
                      {managerCompanyCopy.operators.resetTitle}
                    </h3>
                    <p className="text-subhead text-text-dim">
                      {managerCompanyCopy.operators.resetDescription}
                    </p>
                  </div>
                  <InvitationLinkForm
                    kind="operator_access_reset"
                    label={managerCompanyCopy.operators.resetAccess}
                    operatorId={operator.id}
                    companyName={companyName}
                  />
                </RailSection>
              ) : null}
              {isManager && units.operable.some((u) => u.id !== operator.business_unit_id) && (
                <RailSection label={carrierWebCopy.fleet.businessUnitField}>
                  <MoveForm
                    kind="operator"
                    id={operator.id}
                    currentUnitId={operator.business_unit_id}
                    units={units.operable}
                  />
                </RailSection>
              )}
            </DetailRail>
            {isManager && <FleetArchiveForm kind="operator" id={operator.id} />}
          </div>
        }
      >
        <PageSection title={c.operators.data}>
          <div className="border bg-cell p-5">
            <OperatorForm
              operatorId={operator.id}
              initial={operatorFormValues(operator)}
              emailLocked={operator.profile_id !== null}
              businessUnits={[]}
              defaultBusinessUnitId={null}
            />
          </div>
        </PageSection>

        <PageSection
          title={fleetCopy.operators.documentsTitle}
          description={c.documents.description}
        >
          {/* R4 (D45): what keeps the operator from travelling, by name. */}
          {operator.documentIssue && (
            <Notice tone="attention" className="mb-4">
              {operator.documentIssue}
            </Notice>
          )}
          <FleetDocuments
            companyId={companyId}
            owner={{ type: 'operator', id: operator.id }}
            progress={operator.progress}
          />
        </PageSection>
      </DetailLayout>
    </>
  );
}
