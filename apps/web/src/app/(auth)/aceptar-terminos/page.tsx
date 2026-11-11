import { legalCopy } from '@transport/shared';
import type { Metadata } from 'next';

import { SignOutButton } from '@/components/app-shell';
import { AuthCard } from '@/components/auth-card';
import { AcceptTermsForm } from '@/components/auth-forms';
import { paths, safeNextPath } from '@/lib/routing';
import { requireAccess } from '@/lib/session';

const c = legalCopy.reaccept;

export const metadata: Metadata = { title: c.title };

/**
 * I1 (D35-E1): a signed-in account that has not accepted the current version
 * of the terms (a new version, or an account from before I1) accepts it here
 * before any other screen; then it goes on to where it was going.
 */
export default async function AcceptTermsPage({ searchParams }: PageProps<'/aceptar-terminos'>) {
  await requireAccess(paths.acceptTerms);
  const { next } = await searchParams;
  return (
    <AuthCard title={c.title} description={c.description} footer={<SignOutButton variant="link" />}>
      <p className="text-callout text-text">{c.changes}</p>
      <AcceptTermsForm next={safeNextPath(typeof next === 'string' ? next : null)} />
    </AuthCard>
  );
}
