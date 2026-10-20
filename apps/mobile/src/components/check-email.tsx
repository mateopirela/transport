import { mobileAuthCopy as copy } from '@transport/shared';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';

import { Button, Group, Screen, SectionHeader, TextCell } from './ui';

/**
 * Shown after a sign-up that needs e-mail confirmation: where the link went,
 * and the way back. A screen of its own, or `inline` inside the screen the
 * form was on (the invitation keeps its title and details above it).
 */
export function CheckEmail({
  email,
  children,
  inline = false,
}: {
  email: string;
  children?: ReactNode;
  inline?: boolean;
}) {
  const router = useRouter();
  const content = (
    <>
      <Group>
        <TextCell icon="mail">{copy.checkEmailBody(email)}</TextCell>
      </Group>
      {children}
      <Button
        label={copy.goToSignIn}
        variant="secondary"
        onPress={() => router.replace('/sign-in')}
      />
    </>
  );
  if (inline) {
    return (
      <>
        <SectionHeader title={copy.checkEmailTitle} />
        {content}
      </>
    );
  }
  return <Screen title={copy.checkEmailTitle}>{content}</Screen>;
}
