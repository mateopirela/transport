import { mobileAuthCopy as copy } from '@transport/shared';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button, Centered, Loading, Notice } from '../../components/ui';
import { parseAuthRedirect } from '../../lib/deep-links';
import { useSession } from '../../providers/session';

/**
 * Landing route of the e-mail confirmation link (transport://auth/callback).
 * Exchanges the PKCE code for a session; the root layout then sends the user
 * to their area (an invited operator joins their carrier there).
 */
export default function AuthCallback() {
  const url = Linking.useLinkingURL();
  const router = useRouter();
  const { actions } = useSession();
  const [exchangeFailed, setExchangeFailed] = useState(false);
  const handled = useRef<string | null>(null);
  const redirect = useMemo(() => parseAuthRedirect(url), [url]);

  useEffect(() => {
    if (url !== null && handled.current === url) return;
    handled.current = url;
    // No usable link (e.g. opened by hand): go to the user's area.
    if (redirect.kind === 'none') {
      router.replace('/');
    } else if (redirect.kind === 'code') {
      void actions.completeEmailConfirmation(redirect.code).then((result) => {
        if (result.ok) router.replace('/');
        else setExchangeFailed(true);
      });
    }
  }, [url, redirect, actions, router]);

  const failed = exchangeFailed || redirect.kind === 'error';
  if (!failed) return <Loading label={copy.confirmingEmail} />;
  return (
    <Centered>
      <Notice tone="danger">{copy.confirmEmailFailed}</Notice>
      <Button label={copy.goToSignIn} onPress={() => router.replace('/')} />
    </Centered>
  );
}
