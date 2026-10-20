import {
  carrierWebCopy,
  fleetCopy,
  unitLabel,
  vehicleKindLabels,
  vehicleReleaseCopy,
} from '@transport/shared';
import type { Metadata } from 'next';

import { AvailabilityForm } from '@/components/carrier/availability-form';
import { MoveForm } from '@/components/carrier/company-forms';
import { FleetArchiveForm } from '@/components/carrier/fleet-archive-form';
import { FleetDocuments } from '@/components/carrier/fleet-documents';
import { ReadinessPill } from '@/components/carrier/readiness-pill';
import { RECOMMENDATION_LIST, RecommendationCard } from '@/components/carrier/recommendation-card';
import { ReleaseForm } from '@/components/carrier/release-form';
import { VehicleForm } from '@/components/carrier/vehicle-form';
import { BackLink, PageSection } from '@/components/page-section';
import { Empty } from '@/components/ui/empty';
import { Group } from '@/components/ui/group';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
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
 * recommendations from where it is. The release, when it waits, is the
 * screen's primary; otherwise saving the data.
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
  const recommendations = released && vehicle ? await unitRecommendations(supabase, vehicle) : null;
  const back = <BackLink href={paths.carrierUnits}>{c.units.back}</BackLink>;
  if (!vehicle) {
    return (
      <>
        {back}
        <Notice tone="info">{c.units.notFound}</Notice>
      </>
    );
  }

  return (
    <>
      {back}
      <PageHeader
        title={`${unitLabel(vehicle)} · ${vehicle.plate}`}
        status={<ReadinessPill readiness={vehicle.readiness} />}
        description={[
          vehicleKindLabels[vehicle.kind],
          vehicle.businessUnitName ? fleetCopy.businessUnit(vehicle.businessUnitName) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      />
      {flash === 'alta' && (
        <Notice tone="success" className="mb-8">
          {c.units.created}
        </Notice>
      )}
      {released && (
        <Notice tone="success" className="mb-8">
          {vehicleReleaseCopy.screen.done(vehicle.availability?.city ?? vehicle.plate)}
        </Notice>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_24rem]">
        <div className="min-w-0 space-y-10">
          {release && (
            <PageSection title={vehicleReleaseCopy.screen.title}>
              <div className="rounded-2xl border border-red/30 bg-cell p-5">
                <ReleaseForm
                  vehicleId={vehicle.id}
                  route={`${release.origin.city} → ${release.destination.city}`}
                  context={release}
                />
              </div>
            </PageSection>
          )}
          {recommendations && (
            <PageSection title={vehicleReleaseCopy.screen.recommendations}>
              {recommendations.recommendations.length === 0 ? (
                <Empty title={vehicleReleaseCopy.screen.noRecommendations} />
              ) : (
                <ul className={RECOMMENDATION_LIST}>
                  {recommendations.recommendations.map((r, i) => (
                    <RecommendationCard key={r.loadId} recommendation={r} rank={i + 1} />
                  ))}
                </ul>
              )}
            </PageSection>
          )}
          <PageSection title={c.units.data}>
            <div className="rounded-2xl border bg-cell p-5">
              <VehicleForm
                vehicleId={vehicle.id}
                initial={vehicleFormValues(vehicle)}
                features={vehicle.features}
                businessUnits={[]}
                defaultBusinessUnitId={null}
                primary={!release}
              />
            </div>
          </PageSection>

          <PageSection title={fleetCopy.units.documentsTitle} description={c.documents.description}>
            <FleetDocuments
              companyId={companyId}
              owner={{ type: 'vehicle', id: vehicle.id }}
              progress={vehicle.progress}
            />
          </PageSection>
        </div>

        <aside className="space-y-8">
          <Group label={fleetCopy.availability.title}>
            <div className="px-4 py-4">
              {vehicle.readiness === 'pending_release' ? (
                <Notice tone="error">{vehicleReleaseCopy.errors.pendingRelease}</Notice>
              ) : (
                <AvailabilityForm
                  vehicleId={vehicle.id}
                  current={vehicle.availability}
                  blocked={vehicle.readiness === 'expired_documents'}
                />
              )}
            </div>
          </Group>
          {isManager && units.operable.some((u) => u.id !== vehicle.business_unit_id) && (
            <MoveSection>
              <MoveForm
                kind="vehicle"
                id={vehicle.id}
                currentUnitId={vehicle.business_unit_id}
                units={units.operable}
              />
            </MoveSection>
          )}
          {isManager && <FleetArchiveForm kind="vehicle" id={vehicle.id} />}
        </aside>
      </div>
    </>
  );
}

/** "Unidad de negocio" with the move form, in the side column (the Gerente). */
function MoveSection({ children }: { children: React.ReactNode }) {
  return (
    <Group label={c.businessUnitField}>
      <div className="px-4 py-4">{children}</div>
    </Group>
  );
}
