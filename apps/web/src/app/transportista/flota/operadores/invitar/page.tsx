import { carrierWebCopy, managerCompanyCopy } from '@transport/shared';
import type { Metadata } from 'next';

import { InvitationLinkForm } from '@/components/carrier/invitation-link-form';
import { BackLink } from '@/components/page-section';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { carrierContext } from '@/lib/carrier/context';
import { paths } from '@/lib/routing';

const c = managerCompanyCopy.operators;

export const metadata: Metadata = { title: c.inviteTitle };

/**
 * "Invitar operador" (G4): the Gerente or a Coordinador issues a link for a
 * new operator of one of the business units they operate. Only those are
 * offered (create_invitation checks it again); the operator brings their
 * name, phone and password (G2).
 */
export default async function InviteCarrierOperatorPage() {
  const { viewer, units } = await carrierContext(paths.inviteCarrierOperator);
  return (
    <>
      <BackLink href={paths.carrierOperators}>{carrierWebCopy.fleet.operators.back}</BackLink>
      <PageHeader title={c.inviteTitle} description={c.inviteDescription} />
      {units.operable.length === 0 ? (
        <Notice tone="info">{carrierWebCopy.businessUnit.none}</Notice>
      ) : (
        <div className="max-w-xl rounded-2xl border bg-cell p-5 sm:p-6">
          <InvitationLinkForm
            kind="operator"
            label={c.invite}
            units={units.operable}
            withName
            companyName={viewer.company?.legalName ?? ''}
            primary
          />
        </div>
      )}
    </>
  );
}
