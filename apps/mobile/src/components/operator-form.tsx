import {
  fleetCopy,
  LICENSE_TYPES,
  licenseTypeLabels,
  operatorDraftSchema,
  toOptions,
  type LicenseType,
} from '@transport/shared';
import { useState } from 'react';

import { saveOperator, type OperatorRow } from '../lib/fleet-api';
import { fleetErrorMessage } from '../lib/fleet-errors';
import { validateForm, type FieldErrors } from '../lib/forms';
import type { Supabase } from '../lib/supabase';
import { ChoiceChips } from './fleet-ui';
import { Button, Field, Notice } from './ui';

const copy = fleetCopy.operators;
const LICENSE_OPTIONS = toOptions(LICENSE_TYPES, licenseTypeLabels);

interface OperatorFormState {
  fullName: string;
  email: string;
  phone: string;
  licenseNumber: string;
  licenseType: LicenseType | undefined;
  licenseExpiresOn: string;
}

function initialState(row: OperatorRow | null): OperatorFormState {
  return {
    fullName: row?.full_name ?? '',
    email: row?.email ?? '',
    phone: row?.phone ?? '',
    licenseNumber: row?.license_number ?? '',
    licenseType: row?.license_type ?? undefined,
    licenseExpiresOn: row?.license_expires_on ?? '',
  };
}

/** Registers an operator to invite it, or edits it. Calls `onSaved` with its id. */
export function OperatorForm({
  client,
  companyId,
  operator,
  onSaved,
}: {
  client: Supabase;
  companyId: string;
  operator: OperatorRow | null;
  onSaved: (id: string) => void;
}) {
  const [form, setForm] = useState(() => initialState(operator));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  // The email is the invitation's identity: it cannot change once the operator uses the app.
  const emailLocked = Boolean(operator?.profile_id);

  const set = (field: Exclude<keyof OperatorFormState, 'licenseType'>) => (text: string) =>
    setForm((current) => ({ ...current, [field]: text }));

  async function save() {
    setMessage(null);
    const parsed = validateForm(operatorDraftSchema, form);
    setErrors(parsed.ok ? {} : parsed.errors);
    if (!parsed.ok) return;
    setSaving(true);
    try {
      const id = await saveOperator(
        client,
        parsed.data,
        operator ? { id: operator.id } : { companyId },
      );
      setMessage({ tone: 'info', text: copy.saved });
      onSaved(id);
    } catch (error) {
      setMessage({ tone: 'danger', text: fleetErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Field
        label={copy.fullNameLabel}
        value={form.fullName}
        onChangeText={set('fullName')}
        error={errors.fullName}
        autoComplete="name"
      />
      <Field
        label={copy.emailLabel}
        value={form.email}
        onChangeText={set('email')}
        error={errors.email}
        autoCapitalize="none"
        keyboardType="email-address"
        editable={!emailLocked}
      />
      <Field
        label={copy.phoneLabel}
        value={form.phone}
        onChangeText={set('phone')}
        error={errors.phone}
        keyboardType="phone-pad"
      />
      <Field
        label={copy.licenseNumberLabel}
        value={form.licenseNumber}
        onChangeText={set('licenseNumber')}
        error={errors.licenseNumber}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <ChoiceChips
        label={copy.licenseTypeLabel}
        options={LICENSE_OPTIONS}
        value={form.licenseType}
        onChange={(licenseType) => setForm((current) => ({ ...current, licenseType }))}
        error={errors.licenseType}
      />
      <Field
        label={copy.licenseExpiresOnLabel}
        value={form.licenseExpiresOn}
        onChangeText={set('licenseExpiresOn')}
        error={errors.licenseExpiresOn}
        keyboardType="numbers-and-punctuation"
        placeholder="2028-06-30"
      />
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <Button label={copy.save} onPress={() => void save()} loading={saving} />
    </>
  );
}
