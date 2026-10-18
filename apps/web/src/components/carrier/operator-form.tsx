'use client';

import { carrierWebCopy, fleetCopy, LICENSE_TYPES, licenseTypeLabels } from '@transport/shared';
import { useActionState, useId } from 'react';

import { Field, Notice } from '@/components/auth-forms';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { BusinessUnitOption } from '@/lib/carrier/business-units';
import { saveCarrierOperator } from '@/lib/carrier/fleet-actions';
import type { FormState } from '@/lib/forms';

const c = fleetCopy.operators;
const w = carrierWebCopy.fleet;
const select = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

/**
 * Registers an operator or edits it (G10b; B18 on the app): name, email,
 * phone and the federal license (D16). The email is the invitation's
 * identity, so it is locked once the operator uses the app. A new operator
 * needs its business unit (the Gerente chooses; D19). The server action
 * validates with the shared operatorDraftSchema.
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
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.message && <Notice tone="success">{state.message}</Notice>}
      {operatorId && <input type="hidden" name="operatorId" value={operatorId} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="fullName"
          label={c.fullNameLabel}
          state={state}
          autoComplete="name"
          className="sm:col-span-2"
        />
        <Field
          name="email"
          type="email"
          label={c.emailLabel}
          state={state}
          readOnly={emailLocked}
          hint={emailLocked ? w.operators.emailLocked : undefined}
        />
        <Field name="phone" type="tel" label={c.phoneLabel} state={state} />
        {!operatorId && (
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor={`${id}-business-unit`}>{w.businessUnitField}</Label>
            <select
              id={`${id}-business-unit`}
              name="businessUnitId"
              defaultValue={values.businessUnitId ?? defaultBusinessUnitId ?? ''}
              aria-invalid={errors.businessUnitId ? true : undefined}
              className={select}
            >
              <option value="" disabled />
              {businessUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
            <p
              className={
                errors.businessUnitId ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'
              }
            >
              {errors.businessUnitId ?? w.businessUnitHint}
            </p>
          </div>
        )}
        <Field
          name="licenseNumber"
          label={c.licenseNumberLabel}
          state={state}
          autoCapitalize="characters"
        />
        <div className="space-y-2">
          <Label htmlFor={`${id}-license-type`}>{c.licenseTypeLabel}</Label>
          <select
            id={`${id}-license-type`}
            name="licenseType"
            defaultValue={values.licenseType ?? ''}
            aria-invalid={errors.licenseType ? true : undefined}
            className={select}
          >
            <option value="">{w.operators.licenseTypeNone}</option>
            {LICENSE_TYPES.map((type) => (
              <option key={type} value={type}>
                {licenseTypeLabels[type]}
              </option>
            ))}
          </select>
          {errors.licenseType && <p className="text-xs text-destructive">{errors.licenseType}</p>}
        </div>
        <Field name="licenseExpiresOn" type="date" label={c.licenseExpiresOnLabel} state={state} />
      </div>
      <Button type="submit" variant="accent" disabled={pending}>
        {c.save}
      </Button>
    </form>
  );
}
