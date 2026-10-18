'use client';

import {
  carrierWebCopy,
  fleetCopy,
  SPECIAL_REQUIREMENTS,
  specialRequirementLabels,
  UNIT_TYPES,
  unitTypeLabels,
  VEHICLE_KINDS,
  vehicleKindLabels,
  type SpecialRequirement,
} from '@transport/shared';
import { useActionState, useId, useState } from 'react';

import { Field, Notice } from '@/components/auth-forms';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { BusinessUnitOption } from '@/lib/carrier/business-units';
import { saveCarrierVehicle } from '@/lib/carrier/fleet-actions';
import type { FormState } from '@/lib/forms';

const c = fleetCopy.units;
const w = carrierWebCopy.fleet;
const select = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

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
}: {
  /** Null to register a new unit. */
  vehicleId: string | null;
  /** Current values (text), to edit or refill. */
  initial: Record<string, string>;
  features: readonly SpecialRequirement[];
  /** Business units the new unit may join (empty when editing). */
  businessUnits: readonly BusinessUnitOption[];
  defaultBusinessUnitId: string | null;
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
  const tractor = kind === 'tractor';
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.message && <Notice tone="success">{state.message}</Notice>}
      {vehicleId && <input type="hidden" name="vehicleId" value={vehicleId} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${id}-kind`}>{c.kindLabel}</Label>
          {vehicleId ? (
            <>
              <input type="hidden" name="kind" value={kind} />
              <p className="text-sm">{vehicleKindLabels[kind as (typeof VEHICLE_KINDS)[number]]}</p>
              <p className="text-xs text-muted-foreground">{w.units.kindLocked}</p>
            </>
          ) : (
            <select
              id={`${id}-kind`}
              name="kind"
              value={kind}
              onChange={(event) => setKind(event.target.value)}
              className={select}
            >
              {VEHICLE_KINDS.map((value) => (
                <option key={value} value={value}>
                  {vehicleKindLabels[value]}
                </option>
              ))}
            </select>
          )}
          {errors.kind && <p className="text-xs text-destructive">{errors.kind}</p>}
        </div>
        {!vehicleId && (
          <div className="space-y-2">
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
        <Field name="plate" label={c.plateLabel} state={fieldState} autoCapitalize="characters" />
        <Field name="fleetNumber" label={c.fleetNumberLabel} state={fieldState} />
        <Field name="modelYear" label={c.modelYearLabel} state={fieldState} inputMode="numeric" />
        {!tractor && (
          <>
            <div className="space-y-2">
              <Label htmlFor={`${id}-unit-type`}>{c.unitTypeLabel}</Label>
              <select
                id={`${id}-unit-type`}
                name="unitType"
                defaultValue={values.unitType ?? ''}
                aria-invalid={errors.unitType ? true : undefined}
                className={select}
              >
                <option value="" disabled />
                {UNIT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {unitTypeLabels[type]}
                  </option>
                ))}
              </select>
              {errors.unitType && <p className="text-xs text-destructive">{errors.unitType}</p>}
            </div>
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
            <fieldset className="space-y-2 sm:col-span-2">
              <legend className="text-sm font-medium">{c.featuresLabel}</legend>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                {SPECIAL_REQUIREMENTS.map((feature) => (
                  <label key={feature} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="features"
                      value={feature}
                      defaultChecked={features.includes(feature)}
                      className="accent-accent"
                    />
                    {specialRequirementLabels[feature]}
                  </label>
                ))}
              </div>
              {errors.features && <p className="text-xs text-destructive">{errors.features}</p>}
            </fieldset>
          </>
        )}
      </div>
      <Button type="submit" variant="accent" disabled={pending}>
        {c.save}
      </Button>
    </form>
  );
}
