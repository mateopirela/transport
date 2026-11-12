import { accessSecurityCopy, authCopy, authErrors } from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthCard } from '@/components/auth-card';
import { SignInForm } from '@/components/auth-forms';
import { Notice } from '@/components/ui/notice';
import { paths, safeNextPath } from '@/lib/routing';
import { SESSION_END_PARAM, sessionEndFromParam } from '@/lib/session-limits';

const c = authCopy.signIn;

export const metadata: Metadata = { title: c.title };

export default async function SignInPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === 'string' ? params.next : null) ?? undefined;
  // R5 (D46): why the last session ended (inactivity or its maximum length).
  const sessionEnd = sessionEndFromParam(params[SESSION_END_PARAM]);
  return (
    <AuthCard
      title={c.title}
      description={c.description}
      footer={
        <>
          <p>
            <Link
              href={paths.forgotPassword}
              className="font-semibold text-accent-text hover:underline"
            >
              {c.forgotPassword}
            </Link>
          </p>
          <p>
            {c.noAccount}{' '}
            <Link href={paths.signUp} className="font-semibold text-accent-text hover:underline">
              {c.signUpLink}
            </Link>
          </p>
        </>
      }
    >
      {params.error === 'enlace' && <Notice tone="error">{authErrors.linkInvalid}</Notice>}
      {sessionEnd && <Notice tone="info">{accessSecurityCopy.session[sessionEnd]}</Notice>}
      <SignInForm next={next} />
    </AuthCard>
  );
}
