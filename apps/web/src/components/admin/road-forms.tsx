'use client';

import {
  roadDataStatusLabels,
  roadRiskLevelLabels,
  roadsCopy,
  ROAD_DATA_STATUSES,
  ROAD_RISK_LEVELS,
  tollClassLabels,
  TOLL_VEHICLE_CLASSES,
} from '@transport/shared';
import { useActionState, useId } from 'react';

import { Button } from '@/components/ui/button';
import { Disclosure } from '@/components/ui/disclosure';
import { Field, fieldHelpId } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { Select } from '@/components/ui/select';
import {
  saveCorridor,
  saveRoadSegment,
  saveSegmentRisk,
  setSegmentToll,
} from '@/lib/admin/road-actions';
import type { FormState } from '@/lib/forms';

const c = roadsCopy.admin.form;

type Values = Record<string, string>;

/** One text input of a road form; ids are unique per form (many forms per page). */
function TextField({
  prefix,
  name,
  label,
  state,
  initial,
  inputMode,
  type,
}: {
  prefix: string;
  name: string;
  label: string;
  state: FormState;
  initial: Values;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  type?: string;
}) {
  const id = `${prefix}-${name}`;
  const error = state.fieldErrors?.[name];
  return (
    <Field label={label} htmlFor={id} error={error}>
      <Input
        id={id}
        name={name}
        type={type}
        inputMode={inputMode}
        defaultValue={(state.values ?? initial)[name] ?? ''}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? fieldHelpId(id) : undefined}
      />
    </Field>
  );
}

function Check({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-center gap-2.5 px-1 text-subhead text-text">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="size-4 accent-accent"
      />
      {label}
    </label>
  );
}

function StatusSelect({ prefix, initial }: { prefix: string; initial?: string }) {
  return (
    <Field label={c.dataStatus} htmlFor={`${prefix}-dataStatus`}>
      <Select id={`${prefix}-dataStatus`} name="dataStatus" defaultValue={initial ?? 'estimated'}>
        {ROAD_DATA_STATUSES.map((s) => (
          <option key={s} value={s}>
            {roadDataStatusLabels[s]}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function FormNotices({ state }: { state: FormState }) {
  return (
    <>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.message && <Notice tone="success">{state.message}</Notice>}
    </>
  );
}

/** Creates or edits a road segment (with its source and date), or archives it. */
export function SegmentForm({ initial, summary }: { initial: Values; summary: string }) {
  const prefix = useId();
  const [state, action, pending] = useActionState(saveRoadSegment, {});
  const text = (name: string, label: string, inputMode?: 'decimal' | 'url') => (
    <TextField
      prefix={prefix}
      name={name}
      label={label}
      state={state}
      initial={initial}
      inputMode={inputMode}
    />
  );
  return (
    <Disclosure summary={summary} open={Boolean(state.error || state.fieldErrors)}>
      <form action={action} className="space-y-4" noValidate>
        <FormNotices state={state} />
        {initial.id && <input type="hidden" name="id" value={initial.id} />}
        <div className="grid gap-4 sm:grid-cols-2">
          {text('code', c.code)}
          {text('name', c.name)}
          {text('highway', c.highway)}
          {text('distanceKm', c.distanceKm, 'decimal')}
          {text('fromCity', c.fromCity)}
          {text('fromState', c.fromState)}
          {text('fromLat', c.fromLat, 'decimal')}
          {text('fromLng', c.fromLng, 'decimal')}
          {text('toCity', c.toCity)}
          {text('toState', c.toState)}
          {text('toLat', c.toLat, 'decimal')}
          {text('toLng', c.toLng, 'decimal')}
          {text('source', c.source)}
          {text('sourceUrl', c.sourceUrl, 'url')}
          <TextField
            prefix={prefix}
            name="sourceDate"
            label={c.sourceDate}
            state={state}
            initial={initial}
            type="date"
          />
          <StatusSelect prefix={prefix} initial={initial.dataStatus} />
          <div className="sm:col-span-2">{text('notes', c.notes)}</div>
        </div>
        <Check name="isToll" label={c.isToll} defaultChecked={initial.isToll === 'on'} />
        {initial.id && (
          <Check name="archived" label={c.archived} defaultChecked={initial.archived === 'on'} />
        )}
        <Button type="submit" variant="secondary" size="sm" loading={pending}>
          {c.save}
        </Button>
      </form>
    </Disclosure>
  );
}

/** Sets the toll of a truck class from a date; a blank amount is "Sin dato". */
export function TollForm({ segmentId, today }: { segmentId: string; today: string }) {
  const prefix = useId();
  const [state, action, pending] = useActionState(setSegmentToll, {});
  const initial: Values = { validFrom: today };
  return (
    <Disclosure
      summary={c.setToll}
      look="inline"
      tone="accent"
      open={Boolean(state.error || state.fieldErrors)}
    >
      <form action={action} className="space-y-4 pt-2" noValidate>
        <FormNotices state={state} />
        <input type="hidden" name="segmentId" value={segmentId} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={c.tollClass} htmlFor={`${prefix}-vehicleClass`}>
            <Select id={`${prefix}-vehicleClass`} name="vehicleClass" defaultValue="c5">
              {TOLL_VEHICLE_CLASSES.map((v) => (
                <option key={v} value={v}>
                  {tollClassLabels[v]}
                </option>
              ))}
            </Select>
          </Field>
          <TextField
            prefix={prefix}
            name="amount"
            label={c.tollAmount}
            state={state}
            initial={initial}
            inputMode="decimal"
          />
          <TextField
            prefix={prefix}
            name="source"
            label={c.source}
            state={state}
            initial={initial}
          />
          <TextField
            prefix={prefix}
            name="sourceUrl"
            label={c.sourceUrl}
            state={state}
            initial={initial}
            inputMode="url"
          />
          <TextField
            prefix={prefix}
            name="validFrom"
            label={c.validFrom}
            state={state}
            initial={initial}
            type="date"
          />
          <StatusSelect prefix={prefix} />
        </div>
        <Button type="submit" variant="secondary" size="sm" loading={pending}>
          {c.setToll}
        </Button>
      </form>
    </Disclosure>
  );
}

/** Adds a risk to a segment, with its hour band, source and date. */
export function RiskForm({ segmentId, today }: { segmentId: string; today: string }) {
  const prefix = useId();
  const [state, action, pending] = useActionState(saveSegmentRisk, {});
  const initial: Values = { observedOn: today };
  return (
    <Disclosure
      summary={c.newRisk}
      look="inline"
      tone="accent"
      open={Boolean(state.error || state.fieldErrors)}
    >
      <form action={action} className="space-y-4 pt-2" noValidate>
        <FormNotices state={state} />
        <input type="hidden" name="segmentId" value={segmentId} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={c.level} htmlFor={`${prefix}-level`}>
            <Select id={`${prefix}-level`} name="level" defaultValue="high">
              {ROAD_RISK_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {roadRiskLevelLabels[l]}
                </option>
              ))}
            </Select>
          </Field>
          <TextField
            prefix={prefix}
            name="description"
            label={c.description}
            state={state}
            initial={initial}
          />
          <TextField
            prefix={prefix}
            name="fromHour"
            label={c.fromHour}
            state={state}
            initial={initial}
            inputMode="numeric"
          />
          <TextField
            prefix={prefix}
            name="toHour"
            label={c.toHour}
            state={state}
            initial={initial}
            inputMode="numeric"
          />
          <TextField
            prefix={prefix}
            name="source"
            label={c.source}
            state={state}
            initial={initial}
          />
          <TextField
            prefix={prefix}
            name="sourceUrl"
            label={c.sourceUrl}
            state={state}
            initial={initial}
            inputMode="url"
          />
          <TextField
            prefix={prefix}
            name="observedOn"
            label={c.observedOn}
            state={state}
            initial={initial}
            type="date"
          />
          <StatusSelect prefix={prefix} />
        </div>
        <Button type="submit" variant="secondary" size="sm" loading={pending}>
          {c.save}
        </Button>
      </form>
    </Disclosure>
  );
}

/** Archives one risk (it stays in the audit log). */
export function ArchiveRiskForm({ risk }: { risk: Values }) {
  const [state, action, pending] = useActionState(saveSegmentRisk, {});
  return (
    <form action={action} className="inline">
      {Object.entries(risk).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <input type="hidden" name="archived" value="on" />
      <Button type="submit" variant="plain" size="sm" loading={pending}>
        {c.archiveRisk}
      </Button>
      {state.error && <Notice tone="error">{state.error}</Notice>}
    </form>
  );
}

/** Creates or edits a corridor from the codes of its segments, in order. */
export function CorridorForm({ initial, summary }: { initial: Values; summary: string }) {
  const prefix = useId();
  const [state, action, pending] = useActionState(saveCorridor, {});
  const text = (name: string, label: string, inputMode?: 'decimal') => (
    <TextField
      prefix={prefix}
      name={name}
      label={label}
      state={state}
      initial={initial}
      inputMode={inputMode}
    />
  );
  return (
    <Disclosure summary={summary} open={Boolean(state.error || state.fieldErrors)}>
      <form action={action} className="space-y-4" noValidate>
        <FormNotices state={state} />
        {initial.id && <input type="hidden" name="id" value={initial.id} />}
        <div className="grid gap-4 sm:grid-cols-2">
          {text('code', c.code)}
          {text('name', c.name)}
          {text('originCity', c.originCity)}
          {text('originState', c.originState)}
          {text('originLat', c.originLat, 'decimal')}
          {text('originLng', c.originLng, 'decimal')}
          {text('originRadiusKm', c.originRadius, 'decimal')}
          {text('destinationCity', c.destinationCity)}
          {text('destinationState', c.destinationState)}
          {text('destinationLat', c.destinationLat, 'decimal')}
          {text('destinationLng', c.destinationLng, 'decimal')}
          {text('destinationRadiusKm', c.destinationRadius, 'decimal')}
          <div className="sm:col-span-2">{text('segmentCodes', c.corridorSegments)}</div>
        </div>
        <Check
          name="bidirectional"
          label={c.bidirectional}
          defaultChecked={initial.bidirectional !== 'off'}
        />
        {initial.id && (
          <Check name="archived" label={c.archived} defaultChecked={initial.archived === 'on'} />
        )}
        <Button type="submit" variant="secondary" size="sm" loading={pending}>
          {c.save}
        </Button>
      </form>
    </Disclosure>
  );
}
