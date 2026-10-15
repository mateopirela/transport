import { mobileNavCopy } from '@transport/shared';
import type { ReactNode } from 'react';

import { Body, Screen, Title } from './ui';

/** Tab whose content arrives in a later block (B18–B23). */
export function PlaceholderScreen({
  title,
  message = mobileNavCopy.comingSoon,
  children,
}: {
  title: string;
  message?: string;
  children?: ReactNode;
}) {
  return (
    <Screen>
      <Title>{title}</Title>
      {children}
      <Body>{message}</Body>
    </Screen>
  );
}
