import { mobileAuthCopy, mobileNavCopy as nav } from '@transport/shared';

import { Body, Button, Centered, Notice } from '../components/ui';
import { useSession } from '../providers/session';

/** Shippers and admins use the web app (D06). */
export default function Unsupported() {
  const { actions } = useSession();
  return (
    <Centered>
      <Notice tone="warning" title={nav.wrongPlatformTitle}>
        <Body>{nav.wrongPlatformBody}</Body>
      </Notice>
      <Button label={mobileAuthCopy.signOut} onPress={() => void actions.signOut()} />
    </Centered>
  );
}
