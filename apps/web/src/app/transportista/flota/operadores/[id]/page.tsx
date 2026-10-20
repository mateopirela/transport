import { carrierWebCopy, fleetCopy, formatDate, managerCompanyCopy } from '@transport/shared';
import type { Metadata } from 'next';

import { MoveForm } from '@/components/carrier/company-forms';
import { FleetArchiveForm } from '@/components/carrier/fleet-archive-form';
import { FleetDocuments } from '@/components/carrier/fleet-documents';
import { InvitationLinkForm } from '@/components/carrier/invitation-link-form';
import { OperatorForm } from '@/components/carrier/operator-form';
import { BackLink, PageSection } from '@/components/page-section';
import { Group } from '@/components/ui/group';
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
  const accountTone = operator.profile_id ? 'ok' : operator.invitation ? 'accent' : 'neutral';

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

      <div className="grid gap-8 lg:grid-cols-[1fr_24rem]">
        <div className="min-w-0 space-y-10">
          <PageSection title={c.operators.data}>
            <div className="rounded-2xl border bg-cell p-5">
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
            <FleetDocuments
              companyId={companyId}
              owner={{ type: 'operator', id: operator.id }}
              progress={operator.progress}
            />
          </PageSection>
        </div>

        <aside className="space-y-8">
          {!operator.profile_id ? (
            <Group label={fleetCopy.invitation.title}>
              <div className="space-y-3 px-4 py-4">
                <p className="text-subhead text-text-dim">{fleetCopy.invitation.subtitle}</p>
                <InvitationLinkForm
                  kind="operator"
                  label={fleetCopy.invitation.create}
                  operatorId={operator.id}
                  companyName={companyName}
                />
              </div>
            </Group>
          ) : operator.profile_id !== viewer.userId ? (
            // A hombre-camión's own row is a manager account: never reset (G2).
            <Group label={fleetCopy.invitation.title}>
              <div className="space-y-3 px-4 py-4">
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
              </div>
            </Group>
          ) : null}
          {isManager && units.operable.some((u) => u.id !== operator.business_unit_id) && (
            <Group label={carrierWebCopy.fleet.businessUnitField}>
              <div className="px-4 py-4">
                <MoveForm
                  kind="operator"
                  id={operator.id}
                  currentUnitId={operator.business_unit_id}
                  units={units.operable}
                />
              </div>
            </Group>
          )}
          {isManager && <FleetArchiveForm kind="operator" id={operator.id} />}
        </aside>
      </div>
    </>
  );
}
