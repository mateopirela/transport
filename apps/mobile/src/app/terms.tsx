import {
  legalCopy,
  mobileErrorCopy,
  PLATFORM_NAME,
  termsAcceptanceSchema,
} from '@transport/shared';
import { useState } from 'react';

import { TermsCheckbox } from '../components/legal-links';
import { BottomBar, Button, Group, Notice, Screen, TextCell } from '../components/ui';
import { validateForm, type FieldErrors } from '../lib/forms';
import { useSession } from '../providers/session';

const c = legalCopy.reaccept;

/**
 * I1 (D35-E1): a signed-in account that has not accepted the current version
 * of the terms (a new version, or an account from before I1) accepts it
 * here before anything else (lib/routing.ts, area `terms`). What changed in
 * a group, the checkbox under it and "Aceptar y continuar" fixed at the bottom.
 */
export default function Terms() {
  const { actions, refreshProfile } = useSession();
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [barHeight, setBarHeight] = useState(0);

  async function submit() {
    if (submitting) return;
    setFormError(null);
    const parsed = validateForm(termsAcceptanceSchema, { acceptTerms: accepted });
    setErrors(parsed.ok ? {} : parsed.errors);
    if (!parsed.ok) return;
    setSubmitting(true);
    const result = await actions.acceptTerms();
    if (result.ok) {
      // The profile now carries the acceptance: the guard takes the user on.
      await refreshProfile();
    } else {
      setFormError(mobileErrorCopy[result.error]);
    }
    setSubmitting(false);
  }

  return (
    <>
      <Screen title={c.title} eyebrow={PLATFORM_NAME} subtitle={c.description} bottom={barHeight}>
        {formError ? <Notice tone="danger">{formError}</Notice> : null}
        <Group>
          <TextCell icon="legal">{c.changes}</TextCell>
        </Group>
        <TermsCheckbox checked={accepted} onChange={setAccepted} error={errors.acceptTerms} />
        <Button label={c.signOut} variant="plain" onPress={() => void actions.signOut()} />
      </Screen>
      <BottomBar
        action={{
          label: c.submit,
          onPress: () => void submit(),
          loading: submitting,
          size: 'large',
        }}
        onHeight={setBarHeight}
      />
    </>
  );
}
