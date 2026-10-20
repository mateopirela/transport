'use client';

import {
  carrierWebCopy,
  CITY_PRESETS,
  fleetCopy,
  UNIT_TYPES,
  unitTypeLabels,
} from '@transport/shared';
import { useActionState, useId, useState } from 'react';

import { CheckboxList } from '@/components/carrier/checkbox-list';
import { Button } from '@/components/ui/button';
import { ErrorText, Field, fieldHelpId } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { Select } from '@/components/ui/select';
import { addCarrierRoute, archiveCarrierRoute } from '@/lib/carrier/fleet-actions';
import type { FormState } from '@/lib/forms';

const c = fleetCopy.routes;
const w = carrierWebCopy.fleet.routes;

/** Adds a usual route of the company between two preset cities (G10b; B18 on the app). */
export function RouteForm() {
  const id = useId();
  // Controlled: React resets uncontrolled inputs after every submit, so a
  // failed save would clear the chosen unit types (none means all of them).
  // They are cleared only after the route is added.
  const [unitTypes, setUnitTypes] = useState<readonly string[]>([]);
  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const next = await addCarrierRoute(prev, formData);
    if (next.message) setUnitTypes([]);
    return next;
  }, {});
  const errors = state.fieldErrors ?? {};
  const values = state.values ?? {};
  return (
    <form action={action} className="space-y-5 rounded-2xl border bg-cell p-5" noValidate>
      <h2 className="text-headline text-text">{c.add}</h2>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.message && <Notice tone="success">{state.message}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
        {(['originId', 'destinationId'] as const).map((field) => (
          <Field
            key={field}
            label={field === 'originId' ? c.originLabel : c.destinationLabel}
            htmlFor={`${id}-${field}`}
            error={errors[field]}
          >
            <Select
              id={`${id}-${field}`}
              name={field}
              defaultValue={values[field] ?? (field === 'originId' ? 'mty' : 'gdl')}
              aria-invalid={errors[field] ? true : undefined}
              aria-describedby={errors[field] ? fieldHelpId(`${id}-${field}`) : undefined}
            >
              {CITY_PRESETS.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.city}, {city.state}
                </option>
              ))}
            </Select>
          </Field>
        ))}
        <div className="sm:col-span-2 lg:col-span-1">
          <CheckboxList
            legend={c.unitTypesLabel}
            name="unitTypes"
            options={UNIT_TYPES.map((type) => ({ value: type, label: unitTypeLabels[type] }))}
            checked={unitTypes}
            onChange={setUnitTypes}
          />
          {errors.unitTypes && <ErrorText className="mt-1.5">{errors.unitTypes}</ErrorText>}
        </div>
      </div>
      <Button type="submit" variant="primary" loading={pending} className="w-full">
        {c.save}
      </Button>
    </form>
  );
}

/** Removes (archives) one usual route, after a confirmation. */
export function RemoveRouteForm({ routeId }: { routeId: string }) {
  const [state, action, pending] = useActionState(archiveCarrierRoute, {});
  return (
    <form
      action={action}
      className="space-y-1"
      onSubmit={(event) => {
        if (!window.confirm(w.removeConfirm)) event.preventDefault();
      }}
    >
      <input type="hidden" name="routeId" value={routeId} />
      <Button
        type="submit"
        variant="plain"
        size="sm"
        className="-ml-3 text-red-text hover:text-red-text"
        loading={pending}
      >
        {c.remove}
      </Button>
      {state.error && <ErrorText>{state.error}</ErrorText>}
    </form>
  );
}
