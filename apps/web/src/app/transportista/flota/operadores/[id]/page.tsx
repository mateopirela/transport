import { carrierWebCopy, fleetCopy, formatDate, managerCompanyCopy } from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeading } from '@/components/app-shell';
import { Notice } from '@/components/auth-forms';
import { MoveForm } from '@/components/carrier/company-forms';
import { FleetArchiveForm } from '@/components/carrier/fleet-archive-form';
import { FleetDocuments } from '@/components/carrier/fleet-documents';
import { InvitationLinkForm } from '@/components/carrier/invitation-link-form';
import { OperatorForm } from '@/components/carrier/operator-form';
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
 * D16 documents and, for the Gerente, moving it and the archive.
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
  const back = (
    <Link href={paths.carrierOperators} className="text-sm text-accent hover:underline">
      {c.operators.back}
    </Link>
  );
  if (!operator) {
    return (
      <>
        {back}
        <div className="mt-4">
          <Notice tone="info">{c.operators.notFound}</Notice>
        </div>
      </>
    );
  }
  const account = operator.profile_id
    ? fleetCopy.operators.linked
    : operator.invitation
      ? fleetCopy.operators.invited(formatDate(operator.invitation.expires_at))
      : fleetCopy.operators.notInvited;

  return (
    <>
      {back}
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <PageHeading
          title={operator.full_name}
          description={
            operator.businessUnitName
              ? fleetCopy.businessUnit(operator.businessUnitName)
              : undefined
          }
        />
        <span className="rounded-full border px-2.5 py-0.5 text-xs">{account}</span>
      </div>
      {flash === 'alta' && (
        <div className="mb-6">
          <Notice tone="success">{c.operators.created}</Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-8">
          <section className="space-y-3 rounded-xl border bg-card p-6">
            <h2 className="text-2xl">{c.operators.data}</h2>
            <OperatorForm
              operatorId={operator.id}
              initial={operatorFormValues(operator)}
              emailLocked={operator.profile_id !== null}
              businessUnits={[]}
              defaultBusinessUnitId={null}
            />
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl">{fleetCopy.operators.documentsTitle}</h2>
            <p className="text-sm text-muted-foreground">{c.documents.description}</p>
            <FleetDocuments
              companyId={companyId}
              owner={{ type: 'operator', id: operator.id }}
              progress={operator.progress}
            />
          </section>
        </div>

        <aside className="space-y-6">
          <section className="space-y-3 rounded-xl border bg-card p-4">
            <h2 className="text-xl">{fleetCopy.invitation.title}</h2>
            <p className="text-sm font-medium">{account}</p>
            {!operator.profile_id ? (
              <>
                <p className="text-sm text-muted-foreground">{fleetCopy.invitation.subtitle}</p>
                <InvitationLinkForm
                  kind="operator"
                  label={fleetCopy.invitation.create}
                  operatorId={operator.id}
                  companyName={companyName}
                />
              </>
            ) : operator.profile_id !== viewer.userId ? (
              // A hombre-camión's own row is a manager account: never reset (G2).
              <>
                <h3 className="font-medium">{managerCompanyCopy.operators.resetTitle}</h3>
                <p className="text-sm text-muted-foreground">
                  {managerCompanyCopy.operators.resetDescription}
                </p>
                <InvitationLinkForm
                  kind="operator_access_reset"
                  label={managerCompanyCopy.operators.resetAccess}
                  operatorId={operator.id}
                  companyName={companyName}
                />
              </>
            ) : null}
          </section>
          {isManager && (
            <section className="space-y-2 rounded-xl border bg-card p-4">
              <h2 className="text-xl">{carrierWebCopy.fleet.businessUnitField}</h2>
              <MoveForm
                kind="operator"
                id={operator.id}
                currentUnitId={operator.business_unit_id}
                units={units.operable}
              />
            </section>
          )}
          {isManager && <FleetArchiveForm kind="operator" id={operator.id} />}
        </aside>
      </div>
    </>
  );
}
