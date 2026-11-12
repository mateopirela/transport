import {
  carrierWebCopy,
  documentsBlockUnit,
  formatDateTime,
  unitLabel,
  unitTypeLabels,
  vehicleKindLabels,
  vehicleReleaseCopy,
} from '@transport/shared';
import { Truck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { FleetNav } from '@/components/carrier/fleet-nav';
import { ReadinessPill } from '@/components/carrier/readiness-pill';
import { textLink } from '@/components/page-section';
import { buttonVariants } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Table, TableCell, TableRow } from '@/components/ui/table';
import { carrierContext } from '@/lib/carrier/context';
import { listCarrierVehicles, loadFleetContext } from '@/lib/carrier/fleet';
import { parseFleetFlash } from '@/lib/carrier/fleet-forms';
import { carrierUnitPath, paths } from '@/lib/routing';

const c = carrierWebCopy.fleet;

export const metadata: Metadata = { title: c.units.title };

/**
 * The units of the selected business units with their readiness, what
 * their documents block (R4) and availability (G10b; B18 on the app), as a
 * table. Adding one is the
 * Gerente's primary.
 */
export default async function CarrierUnitsPage({
  searchParams,
}: PageProps<'/transportista/flota/unidades'>) {
  const { supabase, companyId, isManager, units } = await carrierContext(paths.carrierUnits);
  const flash = parseFleetFlash((await searchParams).aviso);
  const context = await loadFleetContext(supabase, companyId);
  const vehicles = await listCarrierVehicles(supabase, context, units.ids);
  const add = isManager && (
    <Link href={paths.newCarrierUnit} className={buttonVariants({ variant: 'primary' })}>
      {c.units.add}
    </Link>
  );

  return (
    <>
      <PageHeader title={c.title} description={c.units.description} action={add} />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <FleetNav current="units" />
        {!isManager && <p className="text-footnote text-text-dim">{c.managerOnly}</p>}
      </div>
      {flash === 'baja' && (
        <Notice tone="success" className="mb-6">
          {c.units.archived}
        </Notice>
      )}
      {vehicles.length === 0 ? (
        <Empty icon={Truck} title={c.units.empty} />
      ) : (
        <Table
          cards
          headers={[
            c.units.columns.unit,
            c.units.columns.kind,
            c.units.columns.businessUnit,
            c.units.columns.readiness,
            c.units.columns.availability,
            { label: c.units.open, srOnly: true },
          ]}
        >
          {vehicles.map((vehicle) => (
            <TableRow key={vehicle.id}>
              <TableCell primary>
                <span className="block">
                  <span className="block">{unitLabel(vehicle)}</span>
                  <span className="block text-meta font-normal text-text-dim">{vehicle.plate}</span>
                </span>
              </TableCell>
              <TableCell label={c.units.columns.kind}>
                {vehicleKindLabels[vehicle.kind]}
                {vehicle.unit_type && (
                  <span className="block text-footnote text-text-dim">
                    {unitTypeLabels[vehicle.unit_type]}
                  </span>
                )}
              </TableCell>
              <TableCell label={c.units.columns.businessUnit} className="text-text-dim">
                {vehicle.businessUnitName ?? ''}
              </TableCell>
              <TableCell label={c.units.columns.readiness}>
                <ReadinessPill readiness={vehicle.readiness} />
                {/* R4 (D45): what keeps it from travelling, by name. */}
                {vehicle.documentIssue && (
                  <span className="mt-1 block text-footnote text-text-dim">
                    {vehicle.documentIssue}
                  </span>
                )}
              </TableCell>
              <TableCell label={c.units.columns.availability} className="text-text-dim">
                {vehicle.availability && !documentsBlockUnit(vehicle.readiness)
                  ? c.units.availableAt(
                      vehicle.availability.city,
                      formatDateTime(vehicle.availability.available_from),
                    )
                  : c.units.noAvailability}
              </TableCell>
              <TableCell action>
                <Link href={carrierUnitPath(vehicle.id)} className={textLink}>
                  {vehicle.readiness === 'pending_release'
                    ? vehicleReleaseCopy.home.open
                    : c.units.open}
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </Table>
      )}
    </>
  );
}
