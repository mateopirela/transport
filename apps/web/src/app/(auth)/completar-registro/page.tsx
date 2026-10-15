import { authCopy, authErrors } from '@transport/shared';
import type { Metadata } from 'next';

import { SignOutButton } from '@/components/app-shell';
import { AuthCard } from '@/components/auth-card';
import { CompleteCompanyForm } from '@/components/auth-forms';
import { isAuthErrorKey } from '@/lib/auth-errors';
import { pendingCompany } from '@/lib/auth/company';
import { paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

const c = authCopy.completeCompany;

export const metadata: Metadata = { title: c.title };

/**
 * Fallback for a shipper whose company could not be registered right after
 * confirming the email (e.g. the RFC was already taken). `?error=` carries
 * the reason as a copy key, never as free text.
 */
export default async function CompleteCompanyPage({
  searchParams,
}: PageProps<'/completar-registro'>) {
  await requireAccess(paths.completeCompany);
  const { error } = await searchParams;
  const supabase = await createClient();
  const pending = supabase ? await pendingCompany(supabase) : null;
  const values: Record<string, string> = pending
    ? {
        personType: pending.company.personType,
        legalName: pending.company.legalName,
        rfc: pending.company.rfc,
        contactName: pending.company.contactName,
        contactEmail: pending.company.contactEmail,
        contactPhone: pending.company.contactPhone,
      }
    : {};
  return (
    <AuthCard
      title={c.title}
      description={c.description}
      footer={<SignOutButton variant="link" className="mx-auto" />}
    >
      <CompleteCompanyForm
        initial={{ values, error: isAuthErrorKey(error) ? authErrors[error] : undefined }}
      />
    </AuthCard>
  );
}
