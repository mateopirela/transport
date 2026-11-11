import { mobileAuthCopy, mobileNavCopy as nav, PLATFORM_NAME } from '@transport/shared';

import { Button, Screen } from '../components/ui';
import { useSession } from '../providers/session';

/**
 * Shippers and admins use the web app (D06): the screen says so under its
 * title and the only thing to do here, signing out, is a quiet button (there
 * is nothing to act on, so no primary).
 */
export default function Unsupported() {
  const { actions } = useSession();
  return (
    <Screen title={nav.wrongPlatformTitle} eyebrow={PLATFORM_NAME} subtitle={nav.wrongPlatformBody}>
      <Button
        label={mobileAuthCopy.signOut}
        variant="secondary"
        onPress={() => void actions.signOut()}
      />
    </Screen>
  );
}
