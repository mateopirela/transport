import { mobileAuthCopy, mobileSystemCopy } from '@transport/shared';
import { useState } from 'react';

import { BottomBar, Button, Notice, Screen } from '../components/ui';
import { useSession } from '../providers/session';

/**
 * The profile could not be loaded (offline, or the row is not readable): what
 * happened as a notice, "Reintentar" fixed at the bottom and the way out as text.
 */
export default function Problem() {
  const { actions, refreshProfile } = useSession();
  const [retrying, setRetrying] = useState(false);
  const [barHeight, setBarHeight] = useState(0);

  async function retry() {
    setRetrying(true);
    await refreshProfile();
    setRetrying(false);
  }

  return (
    <>
      <Screen bottom={barHeight}>
        <Notice tone="danger">{mobileSystemCopy.profileLoadFailed}</Notice>
        <Button
          label={mobileAuthCopy.signOut}
          variant="plain"
          onPress={() => void actions.signOut()}
        />
      </Screen>
      <BottomBar
        action={{
          label: mobileAuthCopy.retry,
          onPress: () => void retry(),
          loading: retrying,
          size: 'large',
        }}
        onHeight={setBarHeight}
      />
    </>
  );
}
