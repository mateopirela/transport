import {
  formatPhone,
  isPhoneAuthEmail,
  mobileAuthCopy,
  mobileErrorCopy,
  mobileNavCopy as nav,
  mobilePhoneCopy,
  normalizeMxPhone,
  userRoleLabels,
} from '@transport/shared';
import { useState, type ReactNode } from 'react';

import { useSession } from '../providers/session';
import { AppearancePicker } from './appearance-picker';
import { LegalLinks } from './legal-links';
import { Button, Cell, FieldCell, Group, Notice, Screen, SectionHeader, ValueRow } from './ui';

/**
 * "Más" tab, as the phone's own settings: what the screen adds (`children`,
 * e.g. the carrier's links), then the account in groups: who is signed in,
 * the appearance, the legal documents and, last, signing out.
 */
export function AccountScreen({ children }: { children?: ReactNode }) {
  const { session, profile, actions } = useSession();
  const [signingOut, setSigningOut] = useState(false);

  const email = session?.user.email;
  const rows: [string, string | null | undefined][] = [
    [mobileAuthCopy.fullNameLabel, profile?.fullName],
    // A phone-only operator (D15-E1) has a synthetic Auth email: never shown.
    [mobileAuthCopy.emailLabel, isPhoneAuthEmail(email) ? null : email],
    [mobileAuthCopy.phoneLabel, profile?.phone ? formatPhone(profile.phone) : null],
    [nav.role, profile ? userRoleLabels[profile.role] : null],
  ];

  async function signOut() {
    setSigningOut(true);
    await actions.signOut();
  }

  return (
    <Screen title={nav.more}>
      {profile && !profile.phone && session ? <CompletePhone userId={session.user.id} /> : null}
      {children}
      <SectionHeader title={nav.account} />
      <Group>
        {profile?.companyName ? (
          <Cell icon="company" title={profile.companyName} strong lines={2} />
        ) : null}
        {rows.map(([label, value]) =>
          value ? <ValueRow key={label} label={label} value={value} /> : null,
        )}
      </Group>
      <AppearancePicker />
      <LegalLinks />
      <Group>
        <Cell
          icon="signOut"
          title={mobileAuthCopy.signOut}
          destructive
          disabled={signingOut}
          onPress={() => void signOut()}
        />
      </Group>
    </Screen>
  );
}

/** "Completa tu teléfono" (G2): accounts from before the phone was required. */
function CompletePhone({ userId }: { userId: string }) {
  const { actions, refreshProfile } = useSession();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  async function save() {
    const normalized = normalizeMxPhone(phone);
    if (!normalized) {
      setError(mobileErrorCopy.phoneInvalid);
      return;
    }
    setError(undefined);
    setSaving(true);
    const result = await actions.savePhone(userId, normalized);
    setSaving(false);
    if (result.ok) await refreshProfile();
    else setError(mobileErrorCopy[result.error]);
  }

  return (
    <>
      <Notice tone="warning" title={mobilePhoneCopy.title}>
        {mobilePhoneCopy.body}
      </Notice>
      <Group>
        <FieldCell
          label={mobilePhoneCopy.label}
          value={phone}
          onChangeText={setPhone}
          error={error}
          autoComplete="tel"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
        />
      </Group>
      <Button label={mobilePhoneCopy.save} onPress={() => void save()} loading={saving} />
    </>
  );
}
