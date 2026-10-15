import { mobileAuthCopy as copy } from '@transport/shared';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';

import { Body, Button, Screen, Title } from './ui';

/** Shown after a sign-up that needs e-mail confirmation. */
export function CheckEmail({ email, children }: { email: string; children?: ReactNode }) {
  const router = useRouter();
  return (
    <Screen>
      <Title>{copy.checkEmailTitle}</Title>
      <Body>{copy.checkEmailBody(email)}</Body>
      {children}
      <Button
        label={copy.goToSignIn}
        variant="secondary"
        onPress={() => router.replace('/sign-in')}
      />
    </Screen>
  );
}
