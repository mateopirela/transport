import {
  fleetCopy,
  fleetErrorCopy,
  LICENSE_TYPES,
  licenseTypeLabels,
  operatorDraftSchema,
  toOptions,
  type BusinessUnitRef,
  type LicenseType,
} from '@transport/shared';
import { useState } from 'react';

import { saveOperator, type OperatorRow } from '../lib/fleet-api';
import { fleetErrorMessage } from '../lib/fleet-errors';
import { validateForm, type FieldErrors } from '../lib/forms';
import type { Supabase } from '../lib/supabase';
import { BusinessUnitChoice } from './business-unit-fields';
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

/**
 * Registers an operator to invite it, or edits it. Calls `onSaved` with its
 * id. A new operator goes to the business unit chosen among `businessUnits`
 * (those the user operates, G4); the email is optional (G2).
 */
export function OperatorForm({
  client,
  companyId,
  operator,
  businessUnits = [],
  onSaved,
}: {
  client: Supabase;
  companyId: string;
  operator: OperatorRow | null;
  businessUnits?: readonly BusinessUnitRef[];
  onSaved: (id: string) => void;
}) {
  const [form, setForm] = useState(() => initialState(operator));
  const [businessUnitId, setBusinessUnitId] = useState<string | undefined>();
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
    const unitMissing = !operator && businessUnits.length > 1 && !businessUnitId;
    setErrors({
      ...(parsed.ok ? {} : parsed.errors),
      ...(unitMissing ? { businessUnitId: fleetErrorCopy.businessUnitRequired } : {}),
    });
    if (!parsed.ok || unitMissing) return;
    setSaving(true);
    try {
      const id = await saveOperator(
        client,
        parsed.data,
        operator ? { id: operator.id } : { companyId, businessUnitId },
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
      {operator ? null : (
        <BusinessUnitChoice
          units={businessUnits}
          value={businessUnitId}
          onChange={setBusinessUnitId}
          error={errors.businessUnitId}
        />
      )}
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
        // Tapping the selected type again clears it (the field is optional).
        onChange={(licenseType) =>
          setForm((current) => ({
            ...current,
            licenseType: current.licenseType === licenseType ? undefined : licenseType,
          }))
        }
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
