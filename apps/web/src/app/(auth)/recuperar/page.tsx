import { authCopy } from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthCard } from '@/components/auth-card';
import { ForgotPasswordForm } from '@/components/auth-forms';
import { paths } from '@/lib/routing';

const c = authCopy.forgotPassword;

export const metadata: Metadata = { title: c.title };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title={c.title}
      description={c.description}
      footer={
        <Link href={paths.signIn} className="font-semibold text-accent-text hover:underline">
          {c.back}
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
