import { authCopy, authErrors, type CompanyRegistrationKind } from '@transport/shared';
import type { Metadata } from 'next';

import { SignOutButton } from '@/components/app-shell';
import { AuthCard } from '@/components/auth-card';
import { CompleteCompanyForm } from '@/components/auth-forms';
import { authErrorKeyField, isAuthErrorKey } from '@/lib/auth-errors';
import { pendingCompany } from '@/lib/auth/company';
import { paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

const c = authCopy.completeCompany;

export const metadata: Metadata = { title: c.title };

/**
 * Fallback for a shipper or a Gerente whose company could not be registered
 * right after confirming the email (e.g. the RFC was already taken), or who
 * signed up from an older build without the fiscal data. `?error=` carries
 * the reason as a copy key, never as free text.
 */
export default async function CompleteCompanyPage({
  searchParams,
}: PageProps<'/completar-registro'>) {
  const viewer = await requireAccess(paths.completeCompany);
  const { error } = await searchParams;
  const supabase = await createClient();
  const pending = supabase ? await pendingCompany(supabase) : null;
  const kinds: readonly CompanyRegistrationKind[] =
    viewer.role === 'shipper' ? ['shipper'] : ['carrier', 'owner_operator'];
  const values: Record<string, string> = {};
  if (pending) {
    for (const [key, value] of Object.entries(pending.company)) {
      if (typeof value === 'string') values[key] = value;
    }
  } else {
    values.contactName = viewer.fullName ?? '';
  }
  // The reason goes on its field when it has one (D50-5: a repeated RFC).
  const reason = isAuthErrorKey(error) ? error : null;
  const field = reason ? authErrorKeyField(reason) : null;
  return (
    <AuthCard
      title={c.title}
      wide
      description={c.description}
      footer={<SignOutButton variant="link" />}
    >
      <CompleteCompanyForm
        kinds={kinds}
        initial={{
          values,
          ...(reason && field
            ? { fieldErrors: { [field]: authErrors[reason] } }
            : { error: reason ? authErrors[reason] : undefined }),
        }}
      />
    </AuthCard>
  );
}
