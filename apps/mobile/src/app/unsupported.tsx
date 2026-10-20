import { mobileAuthCopy, mobileNavCopy as nav } from '@transport/shared';

import { Button, Notice, Screen } from '../components/ui';
import { useSession } from '../providers/session';

/** Shippers and admins use the web app (D06). */
export default function Unsupported() {
  const { actions } = useSession();
  return (
    <Screen>
      <Notice tone="warning" title={nav.wrongPlatformTitle}>
        {nav.wrongPlatformBody}
      </Notice>
      <Button label={mobileAuthCopy.signOut} onPress={() => void actions.signOut()} />
    </Screen>
  );
}
