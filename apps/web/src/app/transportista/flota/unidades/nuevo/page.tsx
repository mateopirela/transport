import { carrierWebCopy, fleetCopy } from '@transport/shared';
import type { Metadata } from 'next';

import { VehicleForm } from '@/components/carrier/vehicle-form';
import { BackLink } from '@/components/page-section';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { carrierContext } from '@/lib/carrier/context';
import { paths } from '@/lib/routing';

const c = carrierWebCopy.fleet;

export const metadata: Metadata = { title: c.units.newTitle };

/** Registers a unit in one of the company's business units (the Gerente, G1a; B18 on the app). */
export default async function NewCarrierUnitPage() {
  const { isManager, units } = await carrierContext(paths.newCarrierUnit);
  return (
    <>
      <BackLink href={paths.carrierUnits}>{c.units.back}</BackLink>
      <PageHeader title={c.units.newTitle} description={fleetCopy.units.saveFirst} />
      {isManager ? (
        <div className="max-w-3xl rounded-2xl border bg-cell p-5 sm:p-6">
          <VehicleForm
            vehicleId={null}
            initial={{ kind: 'trailer' }}
            features={[]}
            businessUnits={units.operable}
            defaultBusinessUnitId={units.selected?.id ?? null}
          />
        </div>
      ) : (
        <Notice tone="info">{c.managerOnly}</Notice>
      )}
    </>
  );
}
