import { authErrors, secondFactorCopy } from '@transport/shared';
import type { Metadata } from 'next';

import { SignOutButton } from '@/components/app-shell';
import { AuthCard } from '@/components/auth-card';
import { TotpChallengeForm, TotpEnrollmentForm } from '@/components/second-factor-forms';
import { Notice } from '@/components/ui/notice';
import { paths, safeNextPath } from '@/lib/routing';
import { requireAccess } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

const c = secondFactorCopy;

export const metadata: Metadata = { title: c.pageTitle };

/**
 * R5 (D46): an admin who signed in with the password (aal1) confirms the
 * session with an authenticator app before the panel. Without a verified
 * factor (the first sign-in, Mateo's in production) it enrolls one here, so
 * nobody is locked out; with one, it types the code.
 */
export default async function SecondFactorPage({ searchParams }: PageProps<'/segundo-factor'>) {
  await requireAccess(paths.secondFactor);
  const { next } = await searchParams;
  const nextPath = safeNextPath(typeof next === 'string' ? next : null);

  const supabase = await createClient();
  const factors = supabase ? await supabase.auth.mfa.listFactors() : null;
  const enrolled = (factors?.data?.totp.length ?? 0) > 0;
  const failed = !factors || factors.error !== null;
  const screen = enrolled ? c.challenge : c.enroll;

  return (
    <AuthCard
      title={screen.title}
      description={screen.description}
      footer={
        <>
          {enrolled && <p>{c.challenge.lostDevice}</p>}
          <SignOutButton variant="link" />
        </>
      }
    >
      {failed ? (
        <Notice tone="error">{authErrors.generic}</Notice>
      ) : enrolled ? (
        <TotpChallengeForm next={nextPath} />
      ) : (
        <TotpEnrollmentForm next={nextPath} />
      )}
    </AuthCard>
  );
}
