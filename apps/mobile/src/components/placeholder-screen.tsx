import { mobileNavCopy } from '@transport/shared';
import type { ReactNode } from 'react';

import { Empty, Screen } from './ui';

/** Tab whose content arrives in a later block (B18–B23): its large title and an empty group. */
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
    <Screen title={title}>
      {children}
      <Empty title={message} />
    </Screen>
  );
}
