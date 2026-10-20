'use client';

import { carrierWebCopy, fleetCopy, LICENSE_TYPES, licenseTypeLabels } from '@transport/shared';
import { useActionState, useId } from 'react';

import { Field } from '@/components/auth-forms';
import { Button } from '@/components/ui/button';
import { Field as FormField, fieldHelpId } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { Select } from '@/components/ui/select';
import type { BusinessUnitOption } from '@/lib/carrier/business-units';
import { saveCarrierOperator } from '@/lib/carrier/fleet-actions';
import type { FormState } from '@/lib/forms';

const c = fleetCopy.operators;
const w = carrierWebCopy.fleet;

/**
 * Registers an operator or edits it (G10b; B18 on the app): name, email,
 * phone and the federal license (D16). The email is the invitation's
 * identity, so it is locked once the operator uses the app. A new operator
 * needs its business unit (the Gerente chooses; D19). The server action
 * validates with the shared operatorDraftSchema. "Guardar" is the screen's
 * primary.
 */
export function OperatorForm({
  operatorId,
  initial,
  emailLocked,
  businessUnits,
  defaultBusinessUnitId,
}: {
  /** Null to register a new operator. */
  operatorId: string | null;
  /** Current values (text), to edit or refill. */
  initial: Record<string, string>;
  emailLocked: boolean;
  /** Business units the new operator may join (empty when editing). */
  businessUnits: readonly BusinessUnitOption[];
  defaultBusinessUnitId: string | null;
}) {
  const id = useId();
  const [state, action, pending] = useActionState<FormState, FormData>(saveCarrierOperator, {
    values: initial,
  });
  const values = state.values ?? initial;
  // After a successful save the state carries only the message: the fields
  // keep showing the saved values (the page's, refreshed by revalidation).
  const fieldState: FormState = { ...state, values };
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-5" noValidate>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.message && <Notice tone="success">{state.message}</Notice>}
      {operatorId && <input type="hidden" name="operatorId" value={operatorId} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="fullName"
          label={c.fullNameLabel}
          state={fieldState}
          autoComplete="name"
          className="sm:col-span-2"
        />
        <Field
          name="email"
          type="email"
          label={c.emailLabel}
          state={fieldState}
          readOnly={emailLocked}
          hint={emailLocked ? w.operators.emailLocked : undefined}
        />
        <Field name="phone" type="tel" label={c.phoneLabel} state={fieldState} />
        {!operatorId && (
          <FormField
            label={w.businessUnitField}
            htmlFor={`${id}-business-unit`}
            error={errors.businessUnitId}
            hint={w.businessUnitHint}
            className="sm:col-span-2"
          >
            <Select
              id={`${id}-business-unit`}
              name="businessUnitId"
              defaultValue={values.businessUnitId ?? defaultBusinessUnitId ?? ''}
              aria-invalid={errors.businessUnitId ? true : undefined}
              aria-describedby={fieldHelpId(`${id}-business-unit`)}
            >
              <option value="" disabled />
              {businessUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </Select>
          </FormField>
        )}
        <Field
          name="licenseNumber"
          label={c.licenseNumberLabel}
          state={fieldState}
          autoCapitalize="characters"
        />
        <FormField
          label={c.licenseTypeLabel}
          htmlFor={`${id}-license-type`}
          error={errors.licenseType}
        >
          <Select
            id={`${id}-license-type`}
            name="licenseType"
            defaultValue={values.licenseType ?? ''}
            aria-invalid={errors.licenseType ? true : undefined}
            aria-describedby={errors.licenseType ? fieldHelpId(`${id}-license-type`) : undefined}
          >
            <option value="">{w.operators.licenseTypeNone}</option>
            {LICENSE_TYPES.map((type) => (
              <option key={type} value={type}>
                {licenseTypeLabels[type]}
              </option>
            ))}
          </Select>
        </FormField>
        <Field
          name="licenseExpiresOn"
          type="date"
          label={c.licenseExpiresOnLabel}
          state={fieldState}
        />
      </div>
      <Button type="submit" variant="primary" loading={pending}>
        {c.save}
      </Button>
    </form>
  );
}
