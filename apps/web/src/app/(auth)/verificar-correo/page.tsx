import { authCopy } from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthCard } from '@/components/auth-card';
import { paths } from '@/lib/routing';

const c = authCopy.checkEmail;

export const metadata: Metadata = { title: c.title };

export default function CheckEmailPage() {
  return (
    <AuthCard title={c.title} description={c.description}>
      <p className="text-center text-subhead">
        <Link href={paths.signIn} className="font-semibold text-accent-text hover:underline">
          {c.back}
        </Link>
      </p>
    </AuthCard>
  );
}
