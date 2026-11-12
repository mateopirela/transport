import { authCopy } from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthCard } from '@/components/auth-card';
import { JoinInvitationForm } from '@/components/auth-forms';
import { paths } from '@/lib/routing';

const c = authCopy.joinInvitation;

export const metadata: Metadata = { title: c.title };

/**
 * /invitacion (D43, R1): where "Únete con tu invitación" leads. The person
 * pastes the link from their Gerente or Coordinador and goes on to
 * /invitacion/[token]. Open with or without a session, like the links
 * themselves (routing.ts).
 */
export default function JoinInvitationPage() {
  return (
    <AuthCard
      title={c.title}
      description={c.description}
      footer={
        <>
          <p>
            {authCopy.signUp.haveAccount}{' '}
            <Link href={paths.signIn} className="font-semibold text-accent-text hover:underline">
              {authCopy.signUp.signInLink}
            </Link>
          </p>
          <p>
            {authCopy.signIn.noAccount}{' '}
            <Link href={paths.signUp} className="font-semibold text-accent-text hover:underline">
              {authCopy.signIn.signUpLink}
            </Link>
          </p>
        </>
      }
    >
      <JoinInvitationForm />
    </AuthCard>
  );
}
