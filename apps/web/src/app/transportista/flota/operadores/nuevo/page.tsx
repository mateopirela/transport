import { carrierWebCopy } from '@transport/shared';
import type { Metadata } from 'next';

import { OperatorForm } from '@/components/carrier/operator-form';
import { BackLink } from '@/components/page-section';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { carrierContext } from '@/lib/carrier/context';
import { paths } from '@/lib/routing';

const c = carrierWebCopy.fleet;

export const metadata: Metadata = { title: c.operators.newTitle };

/** Registers an operator in one of the company's business units (the Gerente, G1a; B18 on the app). */
export default async function NewCarrierOperatorPage() {
  const { isManager, units } = await carrierContext(paths.newCarrierOperator);
  return (
    <>
      <BackLink href={paths.carrierOperators}>{c.operators.back}</BackLink>
      <PageHeader title={c.operators.newTitle} description={c.operators.invitationHint} />
      {isManager ? (
        <div className="max-w-3xl rounded-2xl border bg-cell p-5 sm:p-6">
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
