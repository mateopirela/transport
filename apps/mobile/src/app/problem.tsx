import { mobileAuthCopy, mobileSystemCopy } from '@transport/shared';
import { useState } from 'react';

import { Button, Notice, Screen } from '../components/ui';
import { useSession } from '../providers/session';

/** The profile could not be loaded (offline, or the row is not readable). */
export default function Problem() {
  const { actions, refreshProfile } = useSession();
  const [retrying, setRetrying] = useState(false);

  async function retry() {
    setRetrying(true);
    await refreshProfile();
    setRetrying(false);
  }

  return (
    <Screen>
      <Notice tone="danger">{mobileSystemCopy.profileLoadFailed}</Notice>
      <Button label={mobileAuthCopy.retry} onPress={retry} loading={retrying} />
      <Button
        label={mobileAuthCopy.signOut}
        variant="plain"
        onPress={() => void actions.signOut()}
      />
    </Screen>
  );
}
