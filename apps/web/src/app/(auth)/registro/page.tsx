import { authCopy, legalCopy } from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthCard } from '@/components/auth-card';
import { SignUpForm } from '@/components/auth-forms';
import { paths } from '@/lib/routing';

const c = authCopy.signUp;
const consent = legalCopy.signUpConsent;

export const metadata: Metadata = { title: c.title };

export default function SignUpPage() {
  return (
    <AuthCard
      title={c.title}
      description={c.description}
      footer={
        <>
          <p className="text-muted-foreground">
            {consent.before}{' '}
            <Link href={paths.terms} target="_blank" className="text-accent hover:underline">
              {legalCopy.termsLink}
            </Link>{' '}
            {consent.middle}{' '}
            <Link href={paths.privacy} target="_blank" className="text-accent hover:underline">
              {legalCopy.privacyLink}
            </Link>
            {consent.after}
          </p>
          <p className="text-muted-foreground">
            {c.haveAccount}{' '}
            <Link href={paths.signIn} className="text-accent hover:underline">
              {c.signInLink}
            </Link>
          </p>
        </>
      }
    >
      <SignUpForm />
    </AuthCard>
  );
}
