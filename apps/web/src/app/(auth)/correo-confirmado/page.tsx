import { APP_AUTH_CALLBACK, emailConfirmedCopy } from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthCard } from '@/components/auth-card';
import { buttonVariants } from '@/components/ui/button';
import { paths } from '@/lib/routing';

const c = emailConfirmedCopy;

export const metadata: Metadata = { title: c.title, robots: { index: false, follow: false } };

/**
 * /correo-confirmado (S1, D15-E3): where the confirmation link of an account
 * created in the app ends. The link is the web's, so it confirms the email
 * on any device (/auth/confirm); the account goes on in the app, which is
 * the only action of the screen and so its primary. The deep link carries
 * nothing: the app opens on its sign-in. A Gerente may also go on here, on
 * the web (D06-E1).
 */
export default function EmailConfirmedPage() {
  return (
    <AuthCard
      title={c.title}
      description={c.description}
      footer={
        <p>
          <Link href={paths.home} className="font-semibold text-accent-text hover:underline">
            {c.continueOnWeb}
          </Link>
        </p>
      }
    >
      <a
        href={APP_AUTH_CALLBACK}
        className={buttonVariants({ variant: 'primary', className: 'w-full' })}
      >
        {c.openApp}
      </a>
    </AuthCard>
  );
}
