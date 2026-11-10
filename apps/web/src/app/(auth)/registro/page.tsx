import { authCopy } from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthCard } from '@/components/auth-card';
import { SignUpForm } from '@/components/auth-forms';
import { paths } from '@/lib/routing';

const c = authCopy.signUp;

export const metadata: Metadata = { title: c.title };

export default function SignUpPage() {
  return (
    <AuthCard
      title={c.title}
      wide
      description={c.description}
      footer={
        <p>
          {c.haveAccount}{' '}
          <Link href={paths.signIn} className="font-semibold text-accent-text hover:underline">
            {c.signInLink}
          </Link>
        </p>
      }
    >
      <SignUpForm />
    </AuthCard>
  );
}
