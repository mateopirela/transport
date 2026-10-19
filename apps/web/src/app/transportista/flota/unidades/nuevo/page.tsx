import { carrierWebCopy, fleetCopy } from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeading } from '@/components/app-shell';
import { Notice } from '@/components/auth-forms';
import { VehicleForm } from '@/components/carrier/vehicle-form';
import { carrierContext } from '@/lib/carrier/context';
import { paths } from '@/lib/routing';

const c = carrierWebCopy.fleet;

export const metadata: Metadata = { title: c.units.newTitle };

/** Registers a unit in one of the company's business units (the Gerente, G1a; B18 on the app). */
export default async function NewCarrierUnitPage() {
  const { isManager, units } = await carrierContext(paths.newCarrierUnit);
  return (
    <>
      <Link href={paths.carrierUnits} className="text-sm text-accent hover:underline">
        {c.units.back}
      </Link>
      <div className="mt-4">
        <PageHeading title={c.units.newTitle} description={fleetCopy.units.saveFirst} />
      </div>
      {isManager ? (
        <div className="max-w-3xl rounded-xl border bg-card p-6">
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
