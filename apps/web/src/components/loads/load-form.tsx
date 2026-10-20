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
import { ErrorText, Field as FieldFrame, fieldHelpId } from '@/components/ui/field';
import { Group } from '@/components/ui/group';
import { Select as SelectControl } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formEntries, type FormState } from '@/lib/forms';
import { saveLoad } from '@/lib/loads/actions';
import { parseLoadForm, placeFromValues, type PlaceValue } from '@/lib/loads/form';

import { PlaceField } from './place-field';
import { RouteMap, type RoutePoint } from './route-map';

const c = loadsCopy.form;

const cargoOptions = toOptions(CARGO_TYPES, cargoTypeLabels);
const unitOptions = toOptions(UNIT_TYPES, unitTypeLabels);
const requirementOptions = toOptions(SPECIAL_REQUIREMENTS, specialRequirementLabels);

const toPoint = (place: PlaceValue | null): RoutePoint | null =>
  place && { lat: Number(place.lat), lng: Number(place.lng), label: place.city };

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
        <FieldFrame label={c.notes} htmlFor="field-notes" error={errors.notes}>
          <Textarea
            id="field-notes"
            name="notes"
            rows={3}
            maxLength={1000}
            defaultValue={view.values?.notes}
            aria-invalid={errors.notes ? true : undefined}
            aria-describedby={errors.notes ? fieldHelpId('field-notes') : undefined}
          />
        </FieldFrame>
      </Section>

      {/* The one primary of the screen, at the end on the right (§1.7). It stays
          first in the form, so Enter still publishes. */}
      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        {loadId ? (
          <Button type="submit" disabled={pending} loading={pending}>
            {pending ? c.pending : c.saveChanges}
          </Button>
        ) : (
          <>
            <Button
              type="submit"
              name="intent"
              value="publish"
              disabled={pending}
              loading={pending}
            >
              {pending ? c.pending : c.publish}
            </Button>
            <Button
              type="submit"
              name="intent"
              value="draft"
              variant="secondary"
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
    <Group label={title} footer={hint}>
      <div className="space-y-4 p-4 sm:p-5">{children}</div>
    </Group>
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
  const id = `field-${name}`;
  return (
    <FieldFrame label={label} htmlFor={id} error={error}>
      <SelectControl
        id={id}
        name={name}
        defaultValue={state.values?.[name] ?? ''}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? fieldHelpId(id) : undefined}
      >
        <option value="">{c.select}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectControl>
    </FieldFrame>
  );
}

function Requirements({ state }: { state: FormState }) {
  const selected = new Set(state.values?.specialRequirements?.split(',') ?? []);
  const error = state.fieldErrors?.specialRequirements;
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1.5 px-1 text-label text-text-dim">{c.specialRequirements}</legend>
      <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {requirementOptions.map((option) => (
          <label
            key={option.value}
            className="flex min-h-11 cursor-pointer items-center gap-3 px-1 text-callout text-text"
          >
            <input
              type="checkbox"
              name="specialRequirements"
              value={option.value}
              defaultChecked={selected.has(option.value)}
              className="size-4 shrink-0 accent-accent"
            />
            {option.label}
          </label>
        ))}
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </fieldset>
  );
}
