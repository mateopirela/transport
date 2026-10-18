import {
  carrierWebCopy,
  fleetCopy,
  unitLabel,
  vehicleKindLabels,
  vehicleReadinessLabels,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeading } from '@/components/app-shell';
import { Notice } from '@/components/auth-forms';
import { AvailabilityForm } from '@/components/carrier/availability-form';
import { FleetArchiveForm } from '@/components/carrier/fleet-archive-form';
import { FleetDocuments } from '@/components/carrier/fleet-documents';
import { VehicleForm } from '@/components/carrier/vehicle-form';
import { carrierContext } from '@/lib/carrier/context';
import { getCarrierVehicle, loadFleetContext } from '@/lib/carrier/fleet';
import { parseFleetFlash, vehicleFormValues } from '@/lib/carrier/fleet-forms';
import { carrierUnitPath, paths } from '@/lib/routing';

const c = carrierWebCopy.fleet;

export const metadata: Metadata = { title: fleetCopy.units.editTitle };

/**
 * One unit of the fleet (G10b; B18 on the app): its data (editable by the
 * Gerente and the Coordinador of its business unit), its availability
 * (set_vehicle_availability), its D16 documents and, for the Gerente, the
 * archive.
 */
export default async function CarrierUnitPage({
  params,
  searchParams,
}: PageProps<'/transportista/flota/unidades/[id]'>) {
  const { id } = await params;
  const { supabase, companyId, isManager } = await carrierContext(carrierUnitPath(id));
  const flash = parseFleetFlash((await searchParams).aviso);
  const context = await loadFleetContext(supabase, companyId);
  const vehicle = await getCarrierVehicle(supabase, context, id);
  const back = (
    <Link href={paths.carrierUnits} className="text-sm text-accent hover:underline">
      {c.units.back}
    </Link>
  );
  if (!vehicle) {
    return (
      <>
        {back}
        <div className="mt-4">
          <Notice tone="info">{c.units.notFound}</Notice>
        </div>
      </>
    );
  }

  return (
    <>
      {back}
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <PageHeading
          title={`${unitLabel(vehicle)} · ${vehicle.plate}`}
          description={[
            vehicleKindLabels[vehicle.kind],
            vehicle.businessUnitName ? fleetCopy.businessUnit(vehicle.businessUnitName) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        />
        <span className="rounded-full border px-2.5 py-0.5 text-xs">
          {vehicleReadinessLabels[vehicle.readiness]}
        </span>
      </div>
      {flash === 'alta' && (
        <div className="mb-6">
          <Notice tone="success">{c.units.created}</Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-8">
          <section className="space-y-3 rounded-xl border bg-card p-6">
            <h2 className="text-2xl">{c.units.data}</h2>
            <VehicleForm
              vehicleId={vehicle.id}
              initial={vehicleFormValues(vehicle)}
              features={vehicle.features}
              businessUnits={[]}
              defaultBusinessUnitId={null}
            />
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl">{fleetCopy.units.documentsTitle}</h2>
            <p className="text-sm text-muted-foreground">{c.documents.description}</p>
            <FleetDocuments
              companyId={companyId}
              owner={{ type: 'vehicle', id: vehicle.id }}
              progress={vehicle.progress}
            />
          </section>
        </div>

        <aside className="space-y-6">
          <section className="space-y-3 rounded-xl border bg-card p-4">
            <h2 className="text-xl">{fleetCopy.availability.title}</h2>
            <AvailabilityForm
              vehicleId={vehicle.id}
              current={vehicle.availability}
              blocked={vehicle.readiness === 'expired_documents'}
            />
          </section>
          {isManager && <FleetArchiveForm kind="vehicle" id={vehicle.id} />}
        </aside>
      </div>
    </>
  );
}
