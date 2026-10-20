import {
  carrierWebCopy,
  formatDateTime,
  unitLabel,
  unitTypeLabels,
  vehicleKindLabels,
  vehicleReleaseCopy,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { FleetNav } from '@/components/carrier/fleet-nav';
import { ReadinessPill } from '@/components/carrier/readiness-pill';
import { textLink } from '@/components/page-section';
import { buttonVariants } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Table } from '@/components/ui/table';
import { carrierContext } from '@/lib/carrier/context';
import { listCarrierVehicles, loadFleetContext } from '@/lib/carrier/fleet';
import { parseFleetFlash } from '@/lib/carrier/fleet-forms';
import { carrierUnitPath, paths } from '@/lib/routing';

const c = carrierWebCopy.fleet;

export const metadata: Metadata = { title: c.units.title };

/** The units of the selected business units with their readiness and availability (G10b; B18 on the app). */
export default async function CarrierUnitsPage({
  searchParams,
}: PageProps<'/transportista/flota/unidades'>) {
  const { supabase, companyId, isManager, units } = await carrierContext(paths.carrierUnits);
  const flash = parseFleetFlash((await searchParams).aviso);
  const context = await loadFleetContext(supabase, companyId);
  const vehicles = await listCarrierVehicles(supabase, context, units.ids);

  return (
    <>
      <PageHeader
        title={c.title}
        description={c.units.description}
        action={
          isManager && (
            <Link href={paths.newCarrierUnit} className={buttonVariants({ variant: 'primary' })}>
              {c.units.add}
            </Link>
          )
        }
      />
      <FleetNav current="units" />
      {flash === 'baja' && (
        <Notice tone="success" className="mb-6">
          {c.units.archived}
        </Notice>
      )}
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-title2 text-text">{c.units.title}</h2>
        {!isManager && <p className="text-footnote text-text-dim">{c.managerOnly}</p>}
      </div>
      {vehicles.length === 0 ? (
        <Empty title={c.units.empty} />
      ) : (
        <Table
          headers={[
            c.units.columns.unit,
            c.units.columns.kind,
            c.units.columns.businessUnit,
            c.units.columns.readiness,
            c.units.columns.availability,
            c.units.columns.actions,
          ]}
        >
          {vehicles.map((vehicle) => (
            <tr key={vehicle.id}>
              <td>
                <p className="font-semibold text-text">{unitLabel(vehicle)}</p>
                <p className="text-footnote text-text-dim tabular-nums">{vehicle.plate}</p>
              </td>
              <td>
                {vehicleKindLabels[vehicle.kind]}
                {vehicle.unit_type && (
                  <p className="text-footnote text-text-dim">{unitTypeLabels[vehicle.unit_type]}</p>
                )}
              </td>
              <td className="text-text-dim">{vehicle.businessUnitName ?? ''}</td>
              <td>
                <ReadinessPill readiness={vehicle.readiness} />
              </td>
              <td className="text-text-dim">
                {vehicle.availability && vehicle.readiness !== 'expired_documents'
                  ? c.units.availableAt(
                      vehicle.availability.city,
                      formatDateTime(vehicle.availability.available_from),
                    )
                  : c.units.noAvailability}
              </td>
              <td>
                <Link href={carrierUnitPath(vehicle.id)} className={textLink}>
                  {vehicle.readiness === 'pending_release'
                    ? vehicleReleaseCopy.home.open
                    : c.units.open}
                </Link>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
