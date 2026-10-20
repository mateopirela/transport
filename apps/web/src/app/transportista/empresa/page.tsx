import {
  businessUnitNames,
  formatDateTime,
  fleetCopy,
  groupByBusinessUnit,
  managerCompanyCopy,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

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
import { PageSection, textLink } from '@/components/page-section';
import { Empty } from '@/components/ui/empty';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Table } from '@/components/ui/table';
import { groupRow } from '@/components/ui/variants';
import { companyFlashMessage, loadManagerCompany } from '@/lib/carrier/company';
import { carrierContext } from '@/lib/carrier/context';
import { FLEET_FLASH_PARAM } from '@/lib/carrier/fleet-forms';
import { TRIP_FILTER_PARAMS } from '@/lib/carrier/trip-filters';
import { withParams } from '@/lib/pagination';
import { carrierOperatorPath, carrierUnitPath, paths } from '@/lib/routing';

const c = managerCompanyCopy;

export const metadata: Metadata = { title: c.title };

/** A white card around an invitation form: its title and line, then the form. */
function InviteCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-xl space-y-4 rounded-2xl border bg-cell p-5">
      <div className="space-y-0.5">
        <h3 className="text-headline text-text">{title}</h3>
        {description && <p className="text-subhead text-text-dim">{description}</p>}
      </div>
      {children}
    </div>
  );
}

/** The label over each business unit's list of units or operators. */
function UnitLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-1.5 px-4 text-label text-text-dim">{children}</h3>;
}

/**
 * "Mi empresa" (G4, D19): the Gerente organizes the company. Business units
 * (create, rename, archive), coordinators (invite by link, their business
 * units, remove), units and operators by business unit (move, archive) and
 * the pending invitation links (revoke). Every change is an RPC that checks
 * the Gerente again; a Coordinador only gets the notice. A page of many
 * small actions: all of them secondary, none primary.
 */
export default async function CarrierCompanyPage({
  searchParams,
}: PageProps<'/transportista/empresa'>) {
  const { supabase, viewer, companyId, isManager } = await carrierContext(paths.carrierCompany);
  const flash = companyFlashMessage((await searchParams)[FLEET_FLASH_PARAM]);
  if (!isManager) {
    return (
      <>
        <PageHeader title={c.title} />
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
      <PageHeader title={c.title} description={c.description} />
      {flash && (
        <Notice tone="success" className="mb-8">
          {flash}
        </Notice>
      )}
      <div className="space-y-14">
        <PageSection title={c.sections.businessUnits} description={c.businessUnits.description}>
          <Table headers={[c.columns.name, c.columns.content, c.columns.actions]}>
            {units.map((unit) => (
              <tr key={unit.id} data-testid="business-unit-row">
                <td className="font-semibold">{unit.name}</td>
                <td className="text-text-dim">{count(unit.id)}</td>
                <td className="space-y-1">
                  <Link
                    href={withParams(
                      paths.carrierTrips,
                      {},
                      { [TRIP_FILTER_PARAMS.businessUnit]: unit.id },
                    )}
                    className={`inline-block py-1 text-subhead ${textLink}`}
                  >
                    {c.businessUnits.viewTrips}
                  </Link>
                  <RenameBusinessUnitForm unit={unit} />
                  {units.length > 1 && <ArchiveBusinessUnitForm unitId={unit.id} />}
                </td>
              </tr>
            ))}
          </Table>
          <div className="pt-2">
            <CreateBusinessUnitForm />
          </div>
        </PageSection>

        <PageSection title={c.sections.coordinators} description={c.coordinators.description}>
          {company.coordinators.length === 0 ? (
            <Empty title={c.coordinators.empty} />
          ) : (
            <Table headers={[c.columns.name, c.columns.units, c.columns.actions]}>
              {company.coordinators.map((coordinator) => {
                const names = businessUnitNames(coordinator.unitIds, units);
                return (
                  <tr key={coordinator.id}>
                    <td>
                      <p className="font-semibold text-text">
                        {coordinator.fullName ?? c.invitations.invitee(null)}
                      </p>
                      {coordinator.phone && (
                        <p className="text-footnote text-text-dim tabular-nums">
                          {coordinator.phone}
                        </p>
                      )}
                    </td>
                    <td className="text-text-dim">
                      {names.length > 0 ? names.join(' · ') : c.coordinators.noUnits}
                    </td>
                    <td className="space-y-1">
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
          <InviteCard title={c.coordinators.invite}>
            <InvitationLinkForm
              kind="coordinator"
              label={c.coordinators.invite}
              units={units}
              withName
              companyName={companyName}
            />
          </InviteCard>
        </PageSection>

        <PageSection title={c.sections.units}>
          <div className="space-y-6">
            {vehicleGroups.map((group) => (
              <div key={group.unit?.id ?? 'none'}>
                <UnitLabel>{group.unit?.name ?? c.fleet.noBusinessUnit}</UnitLabel>
                {group.items.length === 0 ? (
                  <p className="px-4 text-subhead text-text-dim">{c.fleet.unitsEmpty}</p>
                ) : (
                  <ul className="overflow-hidden rounded-2xl border bg-cell">
                    {group.items.map((vehicle) => (
                      <li
                        key={vehicle.id}
                        className={`${groupRow} flex flex-wrap items-start justify-between gap-3 px-4 py-3`}
                      >
                        <Link
                          href={carrierUnitPath(vehicle.id)}
                          className="py-1.5 text-body font-semibold text-text tabular-nums hover:underline"
                        >
                          {vehicle.fleet_number
                            ? `${vehicle.plate} · ${vehicle.fleet_number}`
                            : vehicle.plate}
                        </Link>
                        <div className="space-y-1">
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
          </div>
        </PageSection>

        <PageSection title={c.sections.operators}>
          <InviteCard title={c.operators.inviteTitle} description={c.operators.inviteDescription}>
            <InvitationLinkForm
              kind="operator"
              label={c.operators.invite}
              units={units}
              withName
              companyName={companyName}
            />
          </InviteCard>
          <div className="space-y-6 pt-3">
            {operatorGroups.map((group) => (
              <div key={group.unit?.id ?? 'none'}>
                <UnitLabel>{group.unit?.name ?? c.fleet.noBusinessUnit}</UnitLabel>
                {group.items.length === 0 ? (
                  <p className="px-4 text-subhead text-text-dim">{c.fleet.operatorsEmpty}</p>
                ) : (
                  <ul className="overflow-hidden rounded-2xl border bg-cell">
                    {group.items.map((operator) => (
                      <li
                        key={operator.id}
                        className={`${groupRow} flex flex-wrap items-start justify-between gap-3 px-4 py-3`}
                      >
                        <div className="py-1">
                          <Link
                            href={carrierOperatorPath(operator.id)}
                            className="text-body font-semibold text-text hover:underline"
                          >
                            {operator.full_name}
                          </Link>
                          <p className="text-footnote text-text-dim">
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
                        <div className="space-y-1">
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
          </div>
        </PageSection>

        <PageSection title={c.sections.invitations} description={c.invitations.description}>
          {company.invitations.length === 0 ? (
            <Empty title={c.invitations.empty} />
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
                  <td>{c.invitations.kind[invitation.kind]}</td>
                  <td className="font-semibold">
                    {c.invitations.invitee(invitation.invitee_name)}
                  </td>
                  <td className="text-text-dim">
                    {businessUnitNames(invitation.business_unit_ids, units).join(' · ')}
                  </td>
                  <td className="whitespace-nowrap text-text-dim tabular-nums">
                    {c.invitationLink.validUntil(formatDateTime(invitation.expires_at))}
                  </td>
                  <td>
                    <RevokeInvitationForm invitationId={invitation.id} />
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </PageSection>
      </div>
    </>
  );
}
