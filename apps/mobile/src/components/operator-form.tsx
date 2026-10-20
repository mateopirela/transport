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
import { useState, type ReactNode } from 'react';

import { saveOperator, type OperatorRow } from '../lib/fleet-api';
import { fleetErrorMessage } from '../lib/fleet-errors';
import { validateForm, type FieldErrors } from '../lib/forms';
import type { Supabase } from '../lib/supabase';
import { BusinessUnitChoice } from './business-unit-fields';
import { ChoiceCell } from './choice-cell';
import { FieldCell, Group, Notice } from './ui';
import type { FormSave } from './vehicle-form';

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
 * Registers an operator to invite it, or edits it: the fields in a group and
 * the save, which the screen shows as its primary action or as a secondary
 * button. Calls `onSaved` with its id. A new operator goes to the business
 * unit chosen among `businessUnits` (those the user operates, G4); the email
 * is optional (G2).
 */
export function useOperatorForm({
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
}): { section: ReactNode; save: FormSave } {
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

  const section = (
    <>
      <Group>
        <FieldCell
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
        <FieldCell
          label={copy.emailLabel}
          value={form.email}
          onChangeText={set('email')}
          error={errors.email}
          autoCapitalize="none"
          keyboardType="email-address"
          editable={!emailLocked}
        />
        <FieldCell
          label={copy.phoneLabel}
          value={form.phone}
          onChangeText={set('phone')}
          error={errors.phone}
          keyboardType="phone-pad"
        />
      </Group>
      <Group>
        <FieldCell
          label={copy.licenseNumberLabel}
          value={form.licenseNumber}
          onChangeText={set('licenseNumber')}
          error={errors.licenseNumber}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <ChoiceCell
          label={copy.licenseTypeLabel}
          options={LICENSE_OPTIONS}
          value={form.licenseType}
          // Tapping the selected type again clears it (the field is optional).
          clearable
          onChange={(licenseType) => setForm((current) => ({ ...current, licenseType }))}
          error={errors.licenseType}
        />
        <FieldCell
          label={copy.licenseExpiresOnLabel}
          value={form.licenseExpiresOn}
          onChangeText={set('licenseExpiresOn')}
          error={errors.licenseExpiresOn}
          keyboardType="numbers-and-punctuation"
          placeholder="2028-06-30"
        />
      </Group>
      {message ? (
        <Notice tone={message.tone === 'info' ? 'highlight' : 'danger'}>{message.text}</Notice>
      ) : null}
    </>
  );
  return { section, save: { label: copy.save, onPress: () => void save(), loading: saving } };
}
