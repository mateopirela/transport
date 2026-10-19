import { carrierWebCopy } from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeading } from '@/components/app-shell';
import { Notice } from '@/components/auth-forms';
import { OperatorForm } from '@/components/carrier/operator-form';
import { carrierContext } from '@/lib/carrier/context';
import { paths } from '@/lib/routing';

const c = carrierWebCopy.fleet;

export const metadata: Metadata = { title: c.operators.newTitle };

/** Registers an operator in one of the company's business units (the Gerente, G1a; B18 on the app). */
export default async function NewCarrierOperatorPage() {
  const { isManager, units } = await carrierContext(paths.newCarrierOperator);
  return (
    <>
      <Link href={paths.carrierOperators} className="text-sm text-accent hover:underline">
        {c.operators.back}
      </Link>
      <div className="mt-4">
        <PageHeading title={c.operators.newTitle} description={c.operators.invitationHint} />
      </div>
      {isManager ? (
        <div className="max-w-3xl rounded-xl border bg-card p-6">
          <OperatorForm
            operatorId={null}
            initial={{}}
            emailLocked={false}
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
