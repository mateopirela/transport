import { CARGO_INSURANCE_POLICY_CODE, shipperCompanyCopy } from '@transport/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { DocumentUpload } from '@/components/document-upload';
import { PageHeader } from '@/components/ui/page-header';
import { RequirementList } from '@/components/verification';
import { shipperContext } from '@/lib/loads/queries';
import { paths } from '@/lib/routing';
import { registerShipperDocument } from '@/lib/verification/actions';
import { loadCompanyVerification } from '@/lib/verification/queries';

const c = shipperCompanyCopy;

export const metadata: Metadata = { title: c.title };

/**
 * "Documentos de la empresa" of an approved shipper (I1, D35-E1): every
 * company document with its state, and an upload for what is missing,
 * rejected or expired. The annual cargo insurance policy may be renewed while
 * the current one is still approved (the admin approves the new one and it
 * replaces the old, D10).
 */
export default async function ShipperCompanyPage() {
  const { supabase, companyId } = await shipperContext(paths.shipperCompany);
  const verification = await loadCompanyVerification(supabase, companyId);
  if (!verification) notFound();
  const progress = verification.owners[0]?.progress ?? [];

  return (
    <>
      <PageHeader title={c.title} description={c.description} />
      <RequirementList
        progress={progress}
        action={({ requirement, state }) => {
          const renewable =
            requirement.code === CARGO_INSURANCE_POLICY_CODE && state === 'approved';
          if (state !== 'missing' && state !== 'rejected' && state !== 'expired' && !renewable) {
            return null;
          }
          return (
            <DocumentUpload
              companyId={companyId}
              ownerType="company"
              ownerId={companyId}
              requirementId={requirement.id}
              requiresExpiry={requirement.requires_expiry}
              replacing={state !== 'missing'}
              registerAction={registerShipperDocument}
            />
          );
        }}
      />
    </>
  );
}
