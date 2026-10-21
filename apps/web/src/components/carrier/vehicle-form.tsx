'use client';

import {
  carrierWebCopy,
  defaultAxleCount,
  fleetCopy,
  roadsCopy,
  SPECIAL_REQUIREMENTS,
  specialRequirementLabels,
  UNIT_TYPES,
  unitTypeLabels,
  VEHICLE_KINDS,
  vehicleKindLabels,
  type SpecialRequirement,
} from '@transport/shared';
import { useActionState, useId, useState } from 'react';

import { Field } from '@/components/auth-forms';
import { CheckboxList } from '@/components/carrier/checkbox-list';
import { Button } from '@/components/ui/button';
import { ErrorText, Field as FormField, fieldHelpId } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { Select } from '@/components/ui/select';
import type { BusinessUnitOption } from '@/lib/carrier/business-units';
import { saveCarrierVehicle } from '@/lib/carrier/fleet-actions';
import type { FormState } from '@/lib/forms';

const c = fleetCopy.units;
const w = carrierWebCopy.fleet;

/**
 * Registers a unit or edits it (G10b; B18 on the app): kind (fixed after
 * registration), plate, fleet number, model year and, for the unit that
 * carries the cargo, body type, capacity and features. A new unit needs its
 * business unit (the Gerente chooses; D19). The server action validates with
 * the shared vehicleFormSchema.
 */
export function VehicleForm({
  vehicleId,
  initial,
  features,
  businessUnits,
  defaultBusinessUnitId,
  primary = true,
}: {
  /** Null to register a new unit. */
  vehicleId: string | null;
  /** Current values (text), to edit or refill. */
  initial: Record<string, string>;
  features: readonly SpecialRequirement[];
  /** Business units the new unit may join (empty when editing). */
  businessUnits: readonly BusinessUnitOption[];
  defaultBusinessUnitId: string | null;
  /** Whether "Guardar" is the screen's primary (not while a release waits on the same screen). */
  primary?: boolean;
}) {
  const id = useId();
  const [state, action, pending] = useActionState<FormState, FormData>(saveCarrierVehicle, {
    values: initial,
  });
  const values = state.values ?? initial;
  // After a successful save the state carries only the message: the fields
  // keep showing the saved values (the page's, refreshed by revalidation).
  const fieldState: FormState = { ...state, values };
  const [kind, setKind] = useState(values.kind ?? 'trailer');
  // Controlled: React resets uncontrolled inputs after every submit, so a
  // failed save would silently put back the saved features.
  const [checked, setChecked] = useState<readonly string[]>(features);
  const tractor = kind === 'tractor';
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-5" noValidate>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.message && <Notice tone="success">{state.message}</Notice>}
      {vehicleId && <input type="hidden" name="vehicleId" value={vehicleId} />}
      <div className="grid gap-4 sm:grid-cols-2">
        {vehicleId ? (
          <div className="space-y-1.5">
            <p className="px-1 text-label text-text-dim">{c.kindLabel}</p>
            <input type="hidden" name="kind" value={kind} />
            <p className="flex h-11 items-center rounded-md bg-surface-high px-3.5 text-callout text-text">
              {vehicleKindLabels[kind as (typeof VEHICLE_KINDS)[number]]}
            </p>
            <p className="px-1 text-footnote text-text-dim">{w.units.kindLocked}</p>
          </div>
        ) : (
          <FormField label={c.kindLabel} htmlFor={`${id}-kind`} error={errors.kind}>
            <Select
              id={`${id}-kind`}
              name="kind"
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              {VEHICLE_KINDS.map((value) => (
                <option key={value} value={value}>
                  {vehicleKindLabels[value]}
                </option>
              ))}
            </Select>
          </FormField>
        )}
        {!vehicleId && (
          <FormField
            label={w.businessUnitField}
            htmlFor={`${id}-business-unit`}
            error={errors.businessUnitId}
            hint={w.businessUnitHint}
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
        <Field name="plate" label={c.plateLabel} state={fieldState} autoCapitalize="characters" />
        <Field name="fleetNumber" label={c.fleetNumberLabel} state={fieldState} />
        <Field name="modelYear" label={c.modelYearLabel} state={fieldState} inputMode="numeric" />
        <Field
          name="axleCount"
          label={roadsCopy.axles.label}
          state={fieldState}
          inputMode="numeric"
          hint={roadsCopy.axles.hint(
            defaultAxleCount(
              kind as (typeof VEHICLE_KINDS)[number],
              (values.unitType || null) as (typeof UNIT_TYPES)[number] | null,
            ),
          )}
        />
        {!tractor && (
          <>
            <FormField label={c.unitTypeLabel} htmlFor={`${id}-unit-type`} error={errors.unitType}>
              <Select
                id={`${id}-unit-type`}
                name="unitType"
                defaultValue={values.unitType ?? ''}
                aria-invalid={errors.unitType ? true : undefined}
                aria-describedby={errors.unitType ? fieldHelpId(`${id}-unit-type`) : undefined}
              >
                <option value="" disabled />
                {UNIT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {unitTypeLabels[type]}
                  </option>
                ))}
              </Select>
            </FormField>
            <Field
              name="capacityKg"
              label={c.capacityKgLabel}
              state={fieldState}
              inputMode="numeric"
            />
            <Field
              name="capacityM3"
              label={c.capacityM3Label}
              state={fieldState}
              inputMode="decimal"
            />
            <div className="sm:col-span-2">
              <CheckboxList
                legend={c.featuresLabel}
                name="features"
                options={SPECIAL_REQUIREMENTS.map((feature) => ({
                  value: feature,
                  label: specialRequirementLabels[feature],
                }))}
                checked={checked}
                onChange={setChecked}
              />
              {errors.features && <ErrorText className="mt-1.5">{errors.features}</ErrorText>}
            </div>
          </>
        )}
      </div>
      <Button type="submit" variant={primary ? 'primary' : 'secondary'} loading={pending}>
        {c.save}
      </Button>
    </form>
  );
}
