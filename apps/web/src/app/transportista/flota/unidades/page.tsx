import {
  carrierWebCopy,
  formatDateTime,
  unitLabel,
  unitTypeLabels,
  vehicleKindLabels,
  vehicleReadinessLabels,
  vehicleReleaseCopy,
  type VehicleReadiness,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeading } from '@/components/app-shell';
import { Notice } from '@/components/auth-forms';
import { FleetNav } from '@/components/carrier/fleet-nav';
import { buttonVariants } from '@/components/ui/button';
import { Table } from '@/components/ui/table';
import { carrierContext } from '@/lib/carrier/context';
import { listCarrierVehicles, loadFleetContext } from '@/lib/carrier/fleet';
import { parseFleetFlash } from '@/lib/carrier/fleet-forms';
import { carrierUnitPath, paths } from '@/lib/routing';
import { cn } from '@/lib/utils';

const c = carrierWebCopy.fleet;

export const metadata: Metadata = { title: c.units.title };

const READINESS_TONES: Record<VehicleReadiness, string> = {
  pending_release: 'bg-destructive/10 text-destructive',
  expired_documents: 'bg-destructive/10 text-destructive',
  unset: 'bg-muted text-muted-foreground',
  scheduled: 'bg-accent/10 text-accent',
  available: 'bg-success/10 text-success',
};

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
      <PageHeading title={c.title} description={c.units.description} />
      <FleetNav current="units" />
      {flash === 'baja' && (
        <div className="mb-4">
          <Notice tone="success">{c.units.archived}</Notice>
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl">{c.units.title}</h2>
        {isManager ? (
          <Link href={paths.newCarrierUnit} className={buttonVariants({ variant: 'accent' })}>
            {c.units.add}
          </Link>
        ) : (
          <p className="text-xs text-muted-foreground">{c.managerOnly}</p>
        )}
      </div>
      {vehicles.length === 0 ? (
        <p className="text-sm text-muted-foreground">{c.units.empty}</p>
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
              <td className="font-medium">
                {unitLabel(vehicle)}
                <p className="text-xs font-normal text-muted-foreground">{vehicle.plate}</p>
              </td>
              <td>
                {vehicleKindLabels[vehicle.kind]}
                {vehicle.unit_type && (
                  <p className="text-xs text-muted-foreground">
                    {unitTypeLabels[vehicle.unit_type]}
                  </p>
                )}
              </td>
              <td>{vehicle.businessUnitName ?? ''}</td>
              <td>
                <span
                  className={cn(
                    'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
                    READINESS_TONES[vehicle.readiness],
                  )}
                >
                  {vehicleReadinessLabels[vehicle.readiness]}
                </span>
              </td>
              <td className="text-sm">
                {vehicle.availability && vehicle.readiness !== 'expired_documents'
                  ? c.units.availableAt(
                      vehicle.availability.city,
                      formatDateTime(vehicle.availability.available_from),
                    )
                  : c.units.noAvailability}
              </td>
              <td>
                <Link href={carrierUnitPath(vehicle.id)} className="text-accent hover:underline">
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
