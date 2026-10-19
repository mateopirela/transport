import {
  carrierWebCopy,
  fleetCopy,
  unitLabel,
  vehicleKindLabels,
  vehicleReadinessLabels,
  vehicleReleaseCopy,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeading } from '@/components/app-shell';
import { Notice } from '@/components/auth-forms';
import { AvailabilityForm } from '@/components/carrier/availability-form';
import { MoveForm } from '@/components/carrier/company-forms';
import { FleetArchiveForm } from '@/components/carrier/fleet-archive-form';
import { FleetDocuments } from '@/components/carrier/fleet-documents';
import { RecommendationCard } from '@/components/carrier/recommendation-card';
import { ReleaseForm } from '@/components/carrier/release-form';
import { VehicleForm } from '@/components/carrier/vehicle-form';
import { carrierContext } from '@/lib/carrier/context';
import { getCarrierVehicle, loadFleetContext } from '@/lib/carrier/fleet';
import { unitRecommendations } from '@/lib/carrier/loads';
import { getPendingRelease } from '@/lib/carrier/release';
import { parseFleetFlash, vehicleFormValues } from '@/lib/carrier/fleet-forms';
import { carrierUnitPath, paths } from '@/lib/routing';

const c = carrierWebCopy.fleet;

export const metadata: Metadata = { title: fleetCopy.units.editTitle };

/**
 * One unit of the fleet (G10b; B18 on the app): its data (editable by the
 * Gerente and the Coordinador of its business unit), its availability
 * (set_vehicle_availability), its D16 documents and, for the Gerente, the
 * archive. A unit whose trip was cancelled after it set off shows the release
 * form instead of the availability (G5, D20); once released, its
 * recommendations from where it is.
 */
export default async function CarrierUnitPage({
  params,
  searchParams,
}: PageProps<'/transportista/flota/unidades/[id]'>) {
  const { id } = await params;
  const { supabase, companyId, isManager, units } = await carrierContext(carrierUnitPath(id));
  const flash = parseFleetFlash((await searchParams).aviso);
  const context = await loadFleetContext(supabase, companyId);
  const vehicle = await getCarrierVehicle(supabase, context, id);
  const release =
    vehicle?.readiness === 'pending_release' ? await getPendingRelease(supabase, id) : null;
  const released =
    flash === 'liberada' && vehicle !== null && vehicle.readiness !== 'pending_release';
  const recommendations = released ? await unitRecommendations(supabase, id) : null;
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
      {released && (
        <div className="mb-6">
          <Notice tone="success">
            {vehicleReleaseCopy.screen.done(vehicle.availability?.city ?? vehicle.plate)}
          </Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-8">
          {release && (
            <section className="space-y-3 rounded-xl border border-destructive/40 bg-card p-6">
              <h2 className="text-2xl">{vehicleReleaseCopy.screen.title}</h2>
              <ReleaseForm
                vehicleId={vehicle.id}
                route={`${release.origin.city} → ${release.destination.city}`}
                context={release}
              />
            </section>
          )}
          {recommendations && (
            <section className="space-y-3">
              <h2 className="text-2xl">{vehicleReleaseCopy.screen.recommendations}</h2>
              {recommendations.recommendations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {vehicleReleaseCopy.screen.noRecommendations}
                </p>
              ) : (
                <ul className="space-y-2">
                  {recommendations.recommendations.map((r, i) => (
                    <RecommendationCard key={r.loadId} recommendation={r} rank={i + 1} />
                  ))}
                </ul>
              )}
            </section>
          )}
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
            {vehicle.readiness === 'pending_release' ? (
              <Notice tone="error">{vehicleReleaseCopy.errors.pendingRelease}</Notice>
            ) : (
              <AvailabilityForm
                vehicleId={vehicle.id}
                current={vehicle.availability}
                blocked={vehicle.readiness === 'expired_documents'}
              />
            )}
          </section>
          {isManager && (
            <section className="space-y-2 rounded-xl border bg-card p-4">
              <h2 className="text-xl">{c.businessUnitField}</h2>
              <MoveForm
                kind="vehicle"
                id={vehicle.id}
                currentUnitId={vehicle.business_unit_id}
                units={units.operable}
              />
            </section>
          )}
          {isManager && <FleetArchiveForm kind="vehicle" id={vehicle.id} />}
        </aside>
      </div>
    </>
  );
}
