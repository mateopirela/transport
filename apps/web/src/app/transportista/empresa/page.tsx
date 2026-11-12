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
import { SectionAnchors } from '@/components/carrier/section-anchors';
import { PageSection, textLink } from '@/components/page-section';
import { Empty } from '@/components/ui/empty';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Table, TableCell, TableRow } from '@/components/ui/table';
import { groupRow } from '@/components/ui/variants';
import { companyFlashMessage, loadManagerCompany } from '@/lib/carrier/company';
import { carrierContext } from '@/lib/carrier/context';
import { FLEET_FLASH_PARAM } from '@/lib/carrier/fleet-forms';
import { TRIP_FILTER_PARAMS } from '@/lib/carrier/trip-filters';
import { withParams } from '@/lib/pagination';
import { carrierOperatorPath, carrierUnitPath, paths } from '@/lib/routing';

const c = managerCompanyCopy;

/** The anchors of the page's sections (docs/plan-fulmis.md §1.5). */
const SECTION = {
  businessUnits: 'unidades-de-negocio',
  coordinators: 'coordinadores',
  units: 'camiones',
  operators: 'operadores',
  invitations: 'invitaciones',
} as const;

export const metadata: Metadata = { title: c.title };

/** A cell around an invitation form: its title and line, then the form. */
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
    <div className="max-w-xl space-y-4 border bg-cell p-5">
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
  return <h3 className="mb-2 text-subhead font-semibold text-text">{children}</h3>;
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
      <SectionAnchors
        label={c.title}
        items={[
          { id: SECTION.businessUnits, label: c.sections.businessUnits },
          { id: SECTION.coordinators, label: c.sections.coordinators },
          { id: SECTION.units, label: c.sections.units },
          { id: SECTION.operators, label: c.sections.operators },
          { id: SECTION.invitations, label: c.sections.invitations },
        ]}
      />
      <div className="mt-8 space-y-14">
        <PageSection
          id={SECTION.businessUnits}
          title={c.sections.businessUnits}
          description={c.businessUnits.description}
        >
          <Table cards headers={[c.columns.name, c.columns.content, c.columns.actions]}>
            {units.map((unit) => (
              <TableRow key={unit.id} data-testid="business-unit-row">
                <TableCell primary>{unit.name}</TableCell>
                <TableCell label={c.columns.content} className="text-text-dim">
                  {count(unit.id)}
                </TableCell>
                <TableCell action>
                  <span className="inline-flex flex-wrap items-center justify-end gap-2">
                    <Link
                      href={withParams(
                        paths.carrierTrips,
                        {},
                        { [TRIP_FILTER_PARAMS.businessUnit]: unit.id },
                      )}
                      className={`text-subhead ${textLink}`}
                    >
                      {c.businessUnits.viewTrips}
                    </Link>
                    <RenameBusinessUnitForm unit={unit} />
                    {units.length > 1 && <ArchiveBusinessUnitForm unitId={unit.id} />}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </Table>
          <div className="pt-2">
            <CreateBusinessUnitForm />
          </div>
        </PageSection>

        <PageSection
          id={SECTION.coordinators}
          title={c.sections.coordinators}
          description={c.coordinators.description}
        >
          {company.coordinators.length === 0 ? (
            <Empty title={c.coordinators.empty} />
          ) : (
            <Table cards headers={[c.columns.name, c.columns.units, c.columns.actions]}>
              {company.coordinators.map((coordinator) => {
                const names = businessUnitNames(coordinator.unitIds, units);
                return (
                  <TableRow key={coordinator.id}>
                    <TableCell primary>
                      <span className="block">
                        {coordinator.fullName ?? c.invitations.invitee(null)}
                      </span>
                      {coordinator.phone && (
                        <span className="block text-meta font-normal text-text-dim">
                          {coordinator.phone}
                        </span>
                      )}
                    </TableCell>
                    <TableCell label={c.columns.units} className="text-text-dim">
                      {names.length > 0 ? names.join(' · ') : c.coordinators.noUnits}
                    </TableCell>
                    <TableCell action className="space-y-2 whitespace-normal">
                      <CoordinatorUnitsForm
                        profileId={coordinator.id}
                        units={units}
                        selected={coordinator.unitIds}
                      />
                      <RemoveCoordinatorForm profileId={coordinator.id} />
                    </TableCell>
                  </TableRow>
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

        <PageSection id={SECTION.units} title={c.sections.units}>
          <div className="space-y-6">
            {vehicleGroups.map((group) => (
              <div key={group.unit?.id ?? 'none'}>
                <UnitLabel>{group.unit?.name ?? c.fleet.noBusinessUnit}</UnitLabel>
                {group.items.length === 0 ? (
                  <p className="text-subhead text-text-dim">{c.fleet.unitsEmpty}</p>
                ) : (
                  <ul className="overflow-hidden border bg-cell">
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

        <PageSection id={SECTION.operators} title={c.sections.operators}>
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
                  <p className="text-subhead text-text-dim">{c.fleet.operatorsEmpty}</p>
                ) : (
                  <ul className="overflow-hidden border bg-cell">
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

        <PageSection
          id={SECTION.invitations}
          title={c.sections.invitations}
          description={c.invitations.description}
        >
          {company.invitations.length === 0 ? (
            <Empty title={c.invitations.empty} />
          ) : (
            <Table
              cards
              headers={[
                c.columns.kind,
                c.columns.invitee,
                c.columns.units,
                c.columns.expires,
                c.columns.actions,
              ]}
            >
              {company.invitations.map((invitation) => (
                <TableRow key={invitation.id}>
                  <TableCell label={c.columns.kind}>
                    {c.invitations.kind[invitation.kind]}
                  </TableCell>
                  <TableCell primary>{c.invitations.invitee(invitation.invitee_name)}</TableCell>
                  <TableCell label={c.columns.units} className="text-text-dim">
                    {businessUnitNames(invitation.business_unit_ids, units).join(' · ')}
                  </TableCell>
                  <TableCell label={c.columns.expires} className="text-meta text-text-dim">
                    {c.invitationLink.validUntil(formatDateTime(invitation.expires_at))}
                  </TableCell>
                  <TableCell action>
                    <RevokeInvitationForm invitationId={invitation.id} />
                  </TableCell>
                </TableRow>
              ))}
            </Table>
          )}
        </PageSection>
      </div>
    </>
  );
}
