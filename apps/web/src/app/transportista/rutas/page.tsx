import { carrierWebCopy, fleetCopy, unitTypeLabels } from '@transport/shared';
import type { Metadata } from 'next';

import { FleetNav } from '@/components/carrier/fleet-nav';
import { RemoveRouteForm, RouteForm } from '@/components/carrier/route-form';
import { PageSection } from '@/components/page-section';
import { Empty } from '@/components/ui/empty';
import { PageHeader } from '@/components/ui/page-header';
import { Table } from '@/components/ui/table';
import { carrierContext } from '@/lib/carrier/context';
import { listCarrierRoutes } from '@/lib/carrier/fleet';
import { paths } from '@/lib/routing';

const c = carrierWebCopy.fleet;

export const metadata: Metadata = { title: fleetCopy.routes.title };

/** Usual routes of the company, used for recommendations and return trips (G10b; B18 on the app). */
export default async function CarrierRoutesPage() {
  const { supabase, companyId } = await carrierContext(paths.carrierRoutes);
  const routes = await listCarrierRoutes(supabase, companyId);

  return (
    <>
      <PageHeader title={c.title} description={c.routes.description} />
      <FleetNav current="routes" />
      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <PageSection title={fleetCopy.routes.title} className="min-w-0">
          {routes.length === 0 ? (
            <Empty title={fleetCopy.routes.empty} />
          ) : (
            <Table
              headers={[
                c.routes.columns.route,
                c.routes.columns.unitTypes,
                c.routes.columns.actions,
              ]}
            >
              {routes.map((route) => (
                <tr key={route.id}>
                  <td>
                    <p className="font-semibold text-text">
                      {fleetCopy.routes.item(route.origin_city, route.destination_city)}
                    </p>
                    <p className="text-footnote text-text-dim">
                      {route.origin_state} → {route.destination_state}
                    </p>
                  </td>
                  <td className="text-text-dim">
                    {route.unit_types.length === 0
                      ? c.routes.anyUnitType
                      : route.unit_types.map((t) => unitTypeLabels[t]).join(', ')}
                  </td>
                  <td>
                    <RemoveRouteForm routeId={route.id} />
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </PageSection>
        <aside>
          <RouteForm />
        </aside>
      </div>
    </>
  );
}
