import { authCopy } from '@transport/shared';
import type { Metadata } from 'next';

import { AuthCard } from '@/components/auth-card';
import { ResetPasswordForm } from '@/components/auth-forms';
import { paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';

const c = authCopy.resetPassword;

export const metadata: Metadata = { title: c.title };

/** Reached from the recovery email link, which signs the user in first. */
export default async function ResetPasswordPage() {
  await requireAccess(paths.resetPassword);
  return (
    <AuthCard title={c.title} description={c.description}>
      <ResetPasswordForm />
    </AuthCard>
  );
}
