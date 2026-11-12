'use client';

import {
  brokeredCopy,
  CARGO_TYPES,
  clientListsCopy,
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
import { Select as SelectControl } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formEntries, type FormState } from '@/lib/forms';
import { saveLoad } from '@/lib/loads/actions';
import {
  BROKERED_FIELD,
  isBrokeredForm,
  parseBrokeredLoadForm,
  parseLoadForm,
  placeFromValues,
  type PlaceValue,
} from '@/lib/loads/form';

import { PlaceField } from './place-field';
import { RouteMap, type RoutePoint } from './route-map';

const c = loadsCopy.form;
const b = brokeredCopy.shipper;

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
  // I6: a new load can be sent to the platform; its price is then an optional target.
  const [brokered, setBrokered] = useState(() => state.values?.[BROKERED_FIELD] === 'on');
  const view: FormState = { values: state.values, fieldErrors: clientErrors ?? state.fieldErrors };
  const errors = view.fieldErrors ?? {};
  const error = clientErrors ? c.fixErrors : state.error;

  function validate(event: React.FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);
    const requirements = formData.getAll('specialRequirements').map(String);
    const entries = formEntries(formData);
    const result =
      !loadId && isBrokeredForm(entries)
        ? parseBrokeredLoadForm(entries, requirements)
        : parseLoadForm(entries, requirements);
    if (result.success) {
      setClientErrors(null);
      return;
    }
    event.preventDefault();
    setClientErrors(result.state.fieldErrors ?? {});
  }

  const steps = (Object.keys(SECTION_IDS) as SectionKey[]).map((key) => ({
    key,
    title: c.sections[key],
  }));

  return (
    <form action={action} onSubmit={validate} noValidate>
      {loadId && <input type="hidden" name="loadId" value={loadId} />}
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start">
        <div className="min-w-0 space-y-8">
          {error && <Notice tone="error">{error}</Notice>}

          <Section step={1} id={SECTION_IDS.route} title={c.sections.route}>
            <div className="grid gap-4 2xl:grid-cols-2">
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

          <Section
            step={2}
            id={SECTION_IDS.schedule}
            title={c.sections.schedule}
            hint={c.timeZoneHint}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {(['pickupStart', 'pickupEnd', 'deliveryStart', 'deliveryEnd'] as const).map(
                (name) => (
                  <Field
                    key={name}
                    name={name}
                    label={c[name]}
                    type="datetime-local"
                    state={view}
                  />
                ),
              )}
            </div>
          </Section>

          <Section step={3} id={SECTION_IDS.cargo} title={c.sections.cargo}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select name="cargoType" label={c.cargoType} options={cargoOptions} state={view} />
              <Field name="description" label={c.description} maxLength={500} state={view} />
              <Field name="weightKg" label={c.weightKg} inputMode="decimal" state={view} />
              <Field name="volumeM3" label={c.volumeM3} inputMode="decimal" state={view} />
            </div>
          </Section>

          <Section step={4} id={SECTION_IDS.unit} title={c.sections.unit}>
            <div className="sm:max-w-sm">
              <Select name="unitType" label={c.unitType} options={unitOptions} state={view} />
            </div>
            <Requirements state={view} />
          </Section>

          <Section step={5} id={SECTION_IDS.price} title={c.sections.price}>
            {!loadId && (
              <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-callout text-text">
                <input
                  type="checkbox"
                  name={BROKERED_FIELD}
                  checked={brokered}
                  onChange={(event) => setBrokered(event.currentTarget.checked)}
                  className="mt-1 size-4 shrink-0 accent-accent"
                />
                <span className="space-y-0.5">
                  <span className="block">{b.toggle}</span>
                  <span className="block text-subhead text-text-dim">{b.toggleHint}</span>
                </span>
              </label>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                name="price"
                label={brokered ? b.targetPrice : c.price}
                hint={brokered ? b.targetPriceHint : c.priceHint}
                inputMode="decimal"
                state={view}
              />
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
        </div>

        {/* The steps and the one primary of the screen (§0.4): beside the form
            and in view while it scrolls on the desktop, a bar fixed to the
            bottom on a phone. The primary stays the first submit button of
            the form, so Enter still publishes. */}
        <aside className="sticky bottom-0 z-10 -mx-4 border-t bg-bg px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10 xl:top-6 xl:bottom-auto xl:mx-0 xl:border xl:bg-cell xl:p-0">
          <nav aria-label={clientListsCopy.loadForm.steps} className="hidden xl:block">
            <p className="px-5 pt-5 pb-2 text-label text-text-dim">
              {clientListsCopy.loadForm.steps}
            </p>
            <ol className="px-3 pb-3">
              {steps.map((step, index) => (
                <li key={step.key}>
                  <a
                    href={`#${SECTION_IDS[step.key]}`}
                    className="flex h-9 items-center gap-3 rounded-sm px-2 text-subhead text-text transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-text"
                  >
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-control text-caption font-semibold text-text-dim tabular-nums">
                      {index + 1}
                    </span>
                    {step.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <div className="xl:border-t xl:p-5">
            {loadId ? (
              <Button type="submit" className="w-full" disabled={pending} loading={pending}>
                {pending ? c.pending : c.saveChanges}
              </Button>
            ) : brokered ? (
              <Button type="submit" className="w-full" disabled={pending} loading={pending}>
                {pending ? c.pending : b.submit}
              </Button>
            ) : (
              <div className="grid grid-cols-2 gap-2 xl:grid-cols-1">
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
              </div>
            )}
          </div>
        </aside>
      </div>
    </form>
  );
}

/** The anchors of the form's steps. */
const SECTION_IDS = {
  route: 'paso-ruta',
  schedule: 'paso-fechas',
  cargo: 'paso-mercancia',
  unit: 'paso-unidad',
  price: 'paso-precio',
} as const;
type SectionKey = keyof typeof SECTION_IDS;

/** One step of the form: its number, its title and its fields on a cell. */
function Section({
  step,
  id,
  title,
  hint,
  children,
}: {
  step: number;
  id: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6">
      <div className="mb-3 flex items-center gap-3">
        <span
          aria-hidden
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-text text-caption font-semibold text-bg tabular-nums"
        >
          {step}
        </span>
        <h2 id={`${id}-title`} className="text-headline font-extrabold text-text">
          {title}
        </h2>
      </div>
      <div className="space-y-4 border bg-cell p-4 sm:p-5">{children}</div>
      {hint && <p className="mt-2 text-footnote text-text-dim">{hint}</p>}
    </section>
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
      <legend className="mb-1.5 text-label text-text-dim">{c.specialRequirements}</legend>
      <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {requirementOptions.map((option) => (
          <label
            key={option.value}
            className="flex min-h-11 cursor-pointer items-center gap-3 text-callout text-text"
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
