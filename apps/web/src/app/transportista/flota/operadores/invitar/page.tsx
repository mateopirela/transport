import { carrierWebCopy, managerCompanyCopy } from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeading } from '@/components/app-shell';
import { Notice } from '@/components/auth-forms';
import { InvitationLinkForm } from '@/components/carrier/invitation-link-form';
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
      <Link href={paths.carrierOperators} className="text-sm text-accent hover:underline">
        {carrierWebCopy.fleet.operators.back}
      </Link>
      <div className="mt-4">
        <PageHeading title={c.inviteTitle} description={c.inviteDescription} />
      </div>
      {units.operable.length === 0 ? (
        <Notice tone="info">{carrierWebCopy.businessUnit.none}</Notice>
      ) : (
        <div className="max-w-xl rounded-xl border bg-card p-6">
          <InvitationLinkForm
            kind="operator"
            label={c.invite}
            units={units.operable}
            withName
            companyName={viewer.company?.legalName ?? ''}
          />
        </div>
      )}
    </>
  );
}
