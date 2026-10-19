'use client';

import {
  carrierWebCopy,
  CITY_PRESETS,
  fleetCopy,
  UNIT_TYPES,
  unitTypeLabels,
} from '@transport/shared';
import { useActionState, useId, useState } from 'react';

import { Notice } from '@/components/auth-forms';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { addCarrierRoute, archiveCarrierRoute } from '@/lib/carrier/fleet-actions';
import type { FormState } from '@/lib/forms';

const c = fleetCopy.routes;
const w = carrierWebCopy.fleet.routes;
const select = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

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
    <form action={action} className="space-y-4 rounded-xl border bg-card p-4" noValidate>
      <p className="font-medium">{c.add}</p>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.message && <Notice tone="success">{state.message}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        {(['originId', 'destinationId'] as const).map((field) => (
          <div key={field} className="space-y-2">
            <Label htmlFor={`${id}-${field}`}>
              {field === 'originId' ? c.originLabel : c.destinationLabel}
            </Label>
            <select
              id={`${id}-${field}`}
              name={field}
              defaultValue={values[field] ?? (field === 'originId' ? 'mty' : 'gdl')}
              aria-invalid={errors[field] ? true : undefined}
              className={select}
            >
              {CITY_PRESETS.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.city}, {city.state}
                </option>
              ))}
            </select>
            {errors[field] && <p className="text-xs text-destructive">{errors[field]}</p>}
          </div>
        ))}
        <fieldset className="space-y-2 sm:col-span-2">
          <legend className="text-sm font-medium">{c.unitTypesLabel}</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {UNIT_TYPES.map((type) => (
              <label key={type} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="unitTypes"
                  value={type}
                  checked={unitTypes.includes(type)}
                  onChange={(event) =>
                    setUnitTypes((current) =>
                      event.target.checked
                        ? [...current, type]
                        : current.filter((value) => value !== type),
                    )
                  }
                  className="accent-accent"
                />
                {unitTypeLabels[type]}
              </label>
            ))}
          </div>
          {errors.unitTypes && <p className="text-xs text-destructive">{errors.unitTypes}</p>}
        </fieldset>
      </div>
      <Button type="submit" variant="accent" size="sm" disabled={pending}>
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
      <Button type="submit" variant="link" size="sm" disabled={pending}>
        {c.remove}
      </Button>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </form>
  );
}
