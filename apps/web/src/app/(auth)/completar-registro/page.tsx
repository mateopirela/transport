import { authCopy } from '@transport/shared';
import type { Metadata } from 'next';

import { AuthCard } from '@/components/auth-card';
import { CompleteCompanyForm } from '@/components/auth-forms';
import { pendingCompany } from '@/lib/auth/company';
import { paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

const c = authCopy.completeCompany;

export const metadata: Metadata = { title: c.title };

/**
 * Fallback for a shipper whose company could not be registered right after
 * confirming the email (e.g. the RFC was already taken).
 */
export default async function CompleteCompanyPage() {
  await requireAccess(paths.completeCompany);
  const supabase = await createClient();
  const pending = supabase ? await pendingCompany(supabase) : null;
  const initial: Record<string, string> = pending
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
    <AuthCard title={c.title} description={c.description}>
      <CompleteCompanyForm initial={initial} />
    </AuthCard>
  );
}
