import { carrierWebCopy, fleetCopy, unitTypeLabels } from '@transport/shared';
import type { Metadata } from 'next';

import { PageHeading } from '@/components/app-shell';
import { FleetNav } from '@/components/carrier/fleet-nav';
import { RemoveRouteForm, RouteForm } from '@/components/carrier/route-form';
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
      <PageHeading title={c.title} description={c.routes.description} />
      <FleetNav current="routes" />
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <section className="space-y-3">
          <h2 className="text-2xl">{fleetCopy.routes.title}</h2>
          {routes.length === 0 ? (
            <p className="text-sm text-muted-foreground">{fleetCopy.routes.empty}</p>
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
                  <td className="font-medium">
                    {fleetCopy.routes.item(route.origin_city, route.destination_city)}
                    <p className="text-xs font-normal text-muted-foreground">
                      {route.origin_state} → {route.destination_state}
                    </p>
                  </td>
                  <td className="text-sm">
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
        </section>
        <aside>
          <RouteForm />
        </aside>
      </div>
    </>
  );
}
