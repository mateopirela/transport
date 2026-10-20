import { formatDate, trackingCopy as copy } from '@transport/shared';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';

import { AccountScreen } from '../../components/account-screen';
import { ConfirmSheet, type ConfirmSheetHandle } from '../../components/sheet';
import { Cell, Group, Notice, SectionHeader, TextCell } from '../../components/ui';
import { revokeLocationConsent, useLocationConsent } from '../../lib/location-consent';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../providers/session';

export default function OperatorAccountTab() {
  return (
    <AccountScreen>
      <LocationConsentSection />
    </AccountScreen>
  );
}

/** Consent to share the location during trips, and withdrawing it (B22), confirmed in a sheet. */
function LocationConsentSection() {
  const router = useRouter();
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const consent = useLocationConsent(supabase, userId);
  const confirm = useRef<ConfirmSheetHandle>(null);
  const [revoked, setRevoked] = useState(false);

  function askRevoke() {
    const client = supabase;
    if (!client || !userId) return;
    setRevoked(false);
    confirm.current?.ask({
      title: copy.revoke,
      body: copy.revokeConfirm,
      confirmLabel: copy.confirm,
      cancelLabel: copy.cancel,
      destructive: true,
      errorMessage: copy.revokeFailed,
      onConfirm: async () => {
        await revokeLocationConsent(client, userId);
        setRevoked(true);
      },
    });
  }

  if (consent.status === 'loading') return null;
  const given = consent.status === 'given';
  return (
    <>
      <SectionHeader title={copy.accountTitle} />
      {revoked && !given ? <Notice tone="info">{copy.revoked}</Notice> : null}
      <Group>
        <TextCell icon="location" tone="dim">
          {given && consent.acceptedAt
            ? copy.accountGiven(formatDate(consent.acceptedAt))
            : copy.accountMissing}
        </TextCell>
        {given ? (
          <Cell title={copy.revoke} destructive onPress={askRevoke} />
        ) : (
          <Cell
            title={copy.accountReview}
            role="link"
            onPress={() => router.push('/location-consent')}
          />
        )}
      </Group>
      <ConfirmSheet ref={confirm} />
    </>
  );
}
