import {
  businessUnitNames,
  formatDateTime,
  fleetCopy,
  groupByBusinessUnit,
  managerCompanyCopy,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeading } from '@/components/app-shell';
import { Notice } from '@/components/auth-forms';
import {
  ArchiveBusinessUnitForm,
  ArchiveFleetRowForm,
  CoordinatorUnitsForm,
  CreateBusinessUnitForm,
  MoveForm,
  RemoveCoordinatorForm,
  RenameBusinessUnitForm,
  RevokeInvitationForm,
} from '@/components/carrier/company-forms';
import { InvitationLinkForm } from '@/components/carrier/invitation-link-form';
import { Table } from '@/components/ui/table';
import { loadManagerCompany } from '@/lib/carrier/company';
import { carrierContext } from '@/lib/carrier/context';
import { TRIP_FILTER_PARAMS } from '@/lib/carrier/trip-filters';
import { withParams } from '@/lib/pagination';
import { carrierOperatorPath, carrierUnitPath, paths } from '@/lib/routing';

const c = managerCompanyCopy;

export const metadata: Metadata = { title: c.title };

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-2xl">{title}</h2>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      {children}
    </section>
  );
}

/**
 * "Mi empresa" (G4, D19): the Gerente organizes the company. Business units
 * (create, rename, archive), coordinators (invite by link, their business
 * units, remove), units and operators by business unit (move, archive) and
 * the pending invitation links (revoke). Every change is an RPC that checks
 * the Gerente again; a Coordinador only gets the notice.
 */
export default async function CarrierCompanyPage() {
  const { supabase, viewer, companyId, isManager } = await carrierContext(paths.carrierCompany);
  if (!isManager) {
    return (
      <>
        <PageHeading title={c.title} />
        <Notice tone="info">{c.managerOnly}</Notice>
      </>
    );
  }
  const company = await loadManagerCompany(supabase, companyId);
  const companyName = viewer.company?.legalName ?? '';
  const { units } = company;
  const vehicleGroups = groupByBusinessUnit(units, company.vehicles, (v) => v.business_unit_id);
  const operatorGroups = groupByBusinessUnit(units, company.operators, (o) => o.business_unit_id);
  const count = (unitId: string) =>
    c.businessUnits.counts(
      company.vehicles.filter((v) => v.business_unit_id === unitId).length,
      company.operators.filter((o) => o.business_unit_id === unitId).length,
      company.coordinators.filter((p) => p.unitIds.includes(unitId)).length,
    );

  return (
    <>
      <PageHeading title={c.title} description={c.description} />
      <div className="space-y-10">
        <Section title={c.sections.businessUnits} description={c.businessUnits.description}>
          <Table headers={[c.columns.name, c.columns.content, c.columns.actions]}>
            {units.map((unit) => (
              <tr key={unit.id} data-testid="business-unit-row">
                <td className="font-medium">{unit.name}</td>
                <td className="text-sm text-muted-foreground">{count(unit.id)}</td>
                <td className="space-y-2">
                  <Link
                    href={withParams(
                      paths.carrierTrips,
                      {},
                      { [TRIP_FILTER_PARAMS.businessUnit]: unit.id },
                    )}
                    className="text-sm text-accent hover:underline"
                  >
                    {c.businessUnits.viewTrips}
                  </Link>
                  <RenameBusinessUnitForm unit={unit} />
                  {units.length > 1 && <ArchiveBusinessUnitForm unitId={unit.id} />}
                </td>
              </tr>
            ))}
          </Table>
          <CreateBusinessUnitForm />
        </Section>

        <Section title={c.sections.coordinators} description={c.coordinators.description}>
          {company.coordinators.length === 0 ? (
            <p className="text-sm text-muted-foreground">{c.coordinators.empty}</p>
          ) : (
            <Table headers={[c.columns.name, c.columns.units, c.columns.actions]}>
              {company.coordinators.map((coordinator) => {
                const names = businessUnitNames(coordinator.unitIds, units);
                return (
                  <tr key={coordinator.id}>
                    <td className="font-medium">
                      {coordinator.fullName ?? c.invitations.invitee(null)}
                      {coordinator.phone && (
                        <p className="text-xs text-muted-foreground">{coordinator.phone}</p>
                      )}
                    </td>
                    <td className="text-sm">
                      {names.length > 0 ? names.join(' · ') : c.coordinators.noUnits}
                    </td>
                    <td className="space-y-2">
                      <CoordinatorUnitsForm
                        profileId={coordinator.id}
                        units={units}
                        selected={coordinator.unitIds}
                      />
                      <RemoveCoordinatorForm profileId={coordinator.id} />
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
          <div className="max-w-xl rounded-xl border bg-card p-4">
            <h3 className="mb-3 font-medium">{c.coordinators.invite}</h3>
            <InvitationLinkForm
              kind="coordinator"
              label={c.coordinators.invite}
              units={units}
              withName
              companyName={companyName}
            />
          </div>
        </Section>

        <Section title={c.sections.units}>
          {vehicleGroups.map((group) => (
            <div key={group.unit?.id ?? 'none'} className="space-y-2">
              <h3 className="font-medium">{group.unit?.name ?? c.fleet.noBusinessUnit}</h3>
              {group.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">{c.fleet.unitsEmpty}</p>
              ) : (
                <ul className="divide-y rounded-lg border bg-card">
                  {group.items.map((vehicle) => (
                    <li
                      key={vehicle.id}
                      className="flex flex-wrap items-start justify-between gap-3 p-3"
                    >
                      <Link
                        href={carrierUnitPath(vehicle.id)}
                        className="font-medium hover:underline"
                      >
                        {vehicle.fleet_number
                          ? `${vehicle.plate} · ${vehicle.fleet_number}`
                          : vehicle.plate}
                      </Link>
                      <div className="space-y-2">
                        <MoveForm
                          kind="vehicle"
                          id={vehicle.id}
                          currentUnitId={vehicle.business_unit_id}
                          units={units}
                        />
                        <ArchiveFleetRowForm kind="vehicle" id={vehicle.id} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </Section>

        <Section title={c.sections.operators}>
          <div className="max-w-xl rounded-xl border bg-card p-4">
            <h3 className="mb-1 font-medium">{c.operators.inviteTitle}</h3>
            <p className="mb-3 text-sm text-muted-foreground">{c.operators.inviteDescription}</p>
            <InvitationLinkForm
              kind="operator"
              label={c.operators.invite}
              units={units}
              withName
              companyName={companyName}
            />
          </div>
          {operatorGroups.map((group) => (
            <div key={group.unit?.id ?? 'none'} className="space-y-2">
              <h3 className="font-medium">{group.unit?.name ?? c.fleet.noBusinessUnit}</h3>
              {group.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">{c.fleet.operatorsEmpty}</p>
              ) : (
                <ul className="divide-y rounded-lg border bg-card">
                  {group.items.map((operator) => (
                    <li
                      key={operator.id}
                      className="flex flex-wrap items-start justify-between gap-3 p-3"
                    >
                      <div>
                        <Link
                          href={carrierOperatorPath(operator.id)}
                          className="font-medium hover:underline"
                        >
                          {operator.full_name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {[
                            operator.phone ?? operator.email,
                            operator.profile_id
                              ? fleetCopy.operators.linked
                              : fleetCopy.operators.notInvited,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <MoveForm
                          kind="operator"
                          id={operator.id}
                          currentUnitId={operator.business_unit_id}
                          units={units}
                        />
                        <ArchiveFleetRowForm kind="operator" id={operator.id} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </Section>

        <Section title={c.sections.invitations} description={c.invitations.description}>
          {company.invitations.length === 0 ? (
            <p className="text-sm text-muted-foreground">{c.invitations.empty}</p>
          ) : (
            <Table
              headers={[
                c.columns.kind,
                c.columns.invitee,
                c.columns.units,
                c.columns.expires,
                c.columns.actions,
              ]}
            >
              {company.invitations.map((invitation) => (
                <tr key={invitation.id}>
                  <td className="text-sm">{c.invitations.kind[invitation.kind]}</td>
                  <td>{c.invitations.invitee(invitation.invitee_name)}</td>
                  <td className="text-sm">
                    {businessUnitNames(invitation.business_unit_ids, units).join(' · ')}
                  </td>
                  <td className="text-sm whitespace-nowrap">
                    {c.invitationLink.validUntil(formatDateTime(invitation.expires_at))}
                  </td>
                  <td>
                    <RevokeInvitationForm invitationId={invitation.id} />
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Section>
      </div>
    </>
  );
}
