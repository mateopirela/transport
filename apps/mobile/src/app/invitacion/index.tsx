import {
  mobileAuthCopy,
  mobileInviteCopy as copy,
  parseInvitationLink,
  PLATFORM_NAME,
} from '@transport/shared';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { KeyboardBottomBar } from '../../components/keyboard-bar';
import { Button, FieldCell, Footnote, Group, Loading, Screen } from '../../components/ui';
import { useSession } from '../../providers/session';

/**
 * /invitacion without a token (G1b, G2): a coordinator or operator account
 * that does not belong to a company yet, or a visitor who tapped "Únete con
 * tu invitación" (D43, on the sign-in and the sign-up). A token saved at sign-up opens its screen at once;
 * otherwise the link can be pasted, with "Abrir invitación" fixed at the bottom.
 */
export default function InvitationIndex() {
  const { area, actions } = useSession();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [barHeight, setBarHeight] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void actions.pendingInvitation().then((token) => {
      if (cancelled) return;
      if (token) router.replace({ pathname: '/invitacion/[token]', params: { token } });
      else setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [actions, router]);

  function open() {
    const token = parseInvitationLink(link);
    if (!token) {
      setError(copy.invalidBody);
      return;
    }
    setError(undefined);
    router.replace({ pathname: '/invitacion/[token]', params: { token } });
  }

  if (checking) {
    return (
      <Screen>
        <Loading label={copy.loading} />
      </Screen>
    );
  }

  const signedIn = area === 'join';
  return (
    <>
      <Screen
        title={signedIn ? copy.noLinkTitle : copy.title}
        eyebrow={PLATFORM_NAME}
        subtitle={signedIn ? copy.noLinkBody : copy.subtitle}
        bottom={barHeight}
        barOverKeyboard
      >
        <Group>
          <FieldCell
            label={copy.linkLabel}
            value={link}
            onChangeText={setLink}
            error={error}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </Group>
        {signedIn ? (
          <>
            <Footnote>{copy.signOutHint}</Footnote>
            <Button
              label={mobileAuthCopy.signOut}
              variant="plain"
              onPress={() => void actions.signOut()}
            />
          </>
        ) : (
          <Button
            label={mobileAuthCopy.goToSignIn}
            variant="plain"
            onPress={() => router.replace('/sign-in')}
          />
        )}
      </Screen>
      <KeyboardBottomBar
        action={{ label: copy.openLinkAction, onPress: open, size: 'large' }}
        onHeight={setBarHeight}
      />
    </>
  );
}
