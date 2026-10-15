'use client';

import {
  CARGO_TYPES,
  cargoTypeLabels,
  loadsCopy,
  SPECIAL_REQUIREMENTS,
  specialRequirementLabels,
  toOptions,
  UNIT_TYPES,
  unitTypeLabels,
  type SelectOption,
} from '@transport/shared';
import { useActionState, useState } from 'react';

import { Field, Notice } from '@/components/auth-forms';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { formEntries, type FormState } from '@/lib/forms';
import { saveLoad } from '@/lib/loads/actions';
import { parseLoadForm, placeFromValues, type PlaceValue } from '@/lib/loads/form';

import { PlaceField, selectClass } from './place-field';
import { RouteMap, type RoutePoint } from './route-map';

const c = loadsCopy.form;

const cargoOptions = toOptions(CARGO_TYPES, cargoTypeLabels);
const unitOptions = toOptions(UNIT_TYPES, unitTypeLabels);
const requirementOptions = toOptions(SPECIAL_REQUIREMENTS, specialRequirementLabels);

const toPoint = (place: PlaceValue | null): RoutePoint | null =>
  place && { lat: Number(place.lat), lng: Number(place.lng), label: place.city };

const textareaClass =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 aria-invalid:border-destructive';

/**
 * Create or edit a load. Validates in the browser with the same schema as the
 * server action (loadFormSchema), so most mistakes never leave the page.
 */
export function LoadForm({
  loadId,
  initialValues = {},
  roadFactor,
}: {
  /** Present when editing an existing load. */
  loadId?: string;
  initialValues?: Record<string, string>;
  roadFactor: number;
}) {
  const [state, action, pending] = useActionState(saveLoad, { values: initialValues });
  const [clientErrors, setClientErrors] = useState<Record<string, string> | null>(null);
  const [origin, setOrigin] = useState(() => placeFromValues(initialValues, 'origin'));
  const [destination, setDestination] = useState(() =>
    placeFromValues(initialValues, 'destination'),
  );
  const view: FormState = { values: state.values, fieldErrors: clientErrors ?? state.fieldErrors };
  const errors = view.fieldErrors ?? {};
  const error = clientErrors ? c.fixErrors : state.error;

  function validate(event: React.FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);
    const requirements = formData.getAll('specialRequirements').map(String);
    const result = parseLoadForm(formEntries(formData), requirements);
    if (result.success) {
      setClientErrors(null);
      return;
    }
    event.preventDefault();
    setClientErrors(result.state.fieldErrors ?? {});
  }

  return (
    <form action={action} onSubmit={validate} className="space-y-8" noValidate>
      {error && <Notice tone="error">{error}</Notice>}
      {loadId && <input type="hidden" name="loadId" value={loadId} />}

      <Section title={c.sections.route}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <PlaceField
              name="origin"
              label={c.origin}
              value={origin}
              onChange={setOrigin}
              error={errors.origin}
            />
            <PlaceField
              name="destination"
              label={c.destination}
              value={destination}
              onChange={setDestination}
              error={errors.destination}
            />
          </div>
          <RouteMap
            origin={toPoint(origin)}
            destination={toPoint(destination)}
            roadFactor={roadFactor}
          />
        </div>
      </Section>

      <Section title={c.sections.schedule} hint={c.timeZoneHint}>
        <div className="grid gap-4 sm:grid-cols-2">
          {(['pickupStart', 'pickupEnd', 'deliveryStart', 'deliveryEnd'] as const).map((name) => (
            <Field key={name} name={name} label={c[name]} type="datetime-local" state={view} />
          ))}
        </div>
      </Section>

      <Section title={c.sections.cargo}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select name="cargoType" label={c.cargoType} options={cargoOptions} state={view} />
          <Field name="description" label={c.description} maxLength={500} state={view} />
          <Field name="weightKg" label={c.weightKg} inputMode="decimal" state={view} />
          <Field name="volumeM3" label={c.volumeM3} inputMode="decimal" state={view} />
        </div>
      </Section>

      <Section title={c.sections.unit}>
        <Select name="unitType" label={c.unitType} options={unitOptions} state={view} />
        <Requirements state={view} />
      </Section>

      <Section title={c.sections.price}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="price" label={c.price} hint={c.priceHint} inputMode="decimal" state={view} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="field-notes">{c.notes}</Label>
          <textarea
            id="field-notes"
            name="notes"
            rows={3}
            maxLength={1000}
            defaultValue={view.values?.notes}
            aria-invalid={errors.notes ? true : undefined}
            className={textareaClass}
          />
          {errors.notes && <p className="text-xs text-destructive">{errors.notes}</p>}
        </div>
      </Section>

      <div className="flex flex-wrap gap-3">
        {loadId ? (
          <Button type="submit" variant="accent" size="lg" disabled={pending}>
            {pending ? c.pending : c.saveChanges}
          </Button>
        ) : (
          <>
            <Button
              type="submit"
              name="intent"
              value="publish"
              variant="accent"
              size="lg"
              disabled={pending}
            >
              {pending ? c.pending : c.publish}
            </Button>
            <Button
              type="submit"
              name="intent"
              value="draft"
              variant="outline"
              size="lg"
              disabled={pending}
            >
              {c.saveDraft}
            </Button>
          </>
        )}
      </div>
    </form>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-4 rounded-xl border bg-card p-5 sm:p-6">
      <legend className="px-1 font-serif text-xl">{title}</legend>
      {hint && <p className="-mt-2 text-xs text-muted-foreground">{hint}</p>}
      {children}
    </fieldset>
  );
}

function Select({
  name,
  label,
  options,
  state,
}: {
  name: string;
  label: string;
  options: SelectOption<string>[];
  state: FormState;
}) {
  const error = state.fieldErrors?.[name];
  return (
    <div className="space-y-2">
      <Label htmlFor={`field-${name}`}>{label}</Label>
      <select
        id={`field-${name}`}
        name={name}
        defaultValue={state.values?.[name] ?? ''}
        aria-invalid={error ? true : undefined}
        className={selectClass}
      >
        <option value="">{c.select}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function Requirements({ state }: { state: FormState }) {
  const selected = new Set(state.values?.specialRequirements?.split(',') ?? []);
  const error = state.fieldErrors?.specialRequirements;
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{c.specialRequirements}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {requirementOptions.map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="specialRequirements"
              value={option.value}
              defaultChecked={selected.has(option.value)}
              className="accent-accent"
            />
            {option.label}
          </label>
        ))}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </fieldset>
  );
}
