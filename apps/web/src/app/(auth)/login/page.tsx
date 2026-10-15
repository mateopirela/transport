import { authCopy, authErrors } from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthCard } from '@/components/auth-card';
import { Notice, SignInForm } from '@/components/auth-forms';
import { paths, safeNextPath } from '@/lib/routing';

const c = authCopy.signIn;

export const metadata: Metadata = { title: c.title };

export default async function SignInPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === 'string' ? params.next : null) ?? undefined;
  return (
    <AuthCard
      title={c.title}
      description={c.description}
      footer={
        <>
          <p>
            <Link href={paths.forgotPassword} className="text-accent hover:underline">
              {c.forgotPassword}
            </Link>
          </p>
          <p className="text-muted-foreground">
            {c.noAccount}{' '}
            <Link href={paths.signUp} className="text-accent hover:underline">
              {c.signUpLink}
            </Link>
          </p>
        </>
      }
    >
      {params.error === 'enlace' && <Notice tone="error">{authErrors.linkInvalid}</Notice>}
      <SignInForm next={next} />
    </AuthCard>
  );
}
