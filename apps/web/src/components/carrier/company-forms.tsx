'use client';

import { fleetCopy, managerCompanyCopy } from '@transport/shared';
import { useActionState, useId } from 'react';

import { Notice } from '@/components/auth-forms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { BusinessUnitOption } from '@/lib/carrier/business-units';
import {
  archiveBusinessUnitAction,
  archiveFleetRowAction,
  createBusinessUnitAction,
  moveFleetRowAction,
  removeCoordinatorAction,
  renameBusinessUnitAction,
  revokeInvitationAction,
  setCoordinatorUnitsAction,
} from '@/lib/carrier/company-actions';
import type { FormState } from '@/lib/forms';

const c = managerCompanyCopy;
const select = 'h-9 rounded-md border border-input bg-background px-2 text-sm';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

function StateNotice({ state }: { state: FormState }) {
  if (state.error) return <Notice tone="error">{state.error}</Notice>;
  if (state.message) return <Notice tone="success">{state.message}</Notice>;
  return null;
}

/**
 * A destructive change folded until opened and confirmed, so a stray click
 * never archives or removes anything (as FleetArchiveForm, G10b).
 */
function ConfirmForm({
  action,
  summary,
  title,
  body,
  confirm,
  hidden,
}: {
  action: Action;
  summary: string;
  title: string;
  body: string;
  confirm: string;
  hidden: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <details className="rounded-md text-sm" open={Boolean(state.error)}>
      <summary className="cursor-pointer text-destructive">{summary}</summary>
      <form action={formAction} className="mt-2 space-y-2 rounded-md border p-3">
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground">{body}</p>
        <StateNotice state={state} />
        {Object.entries(hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {confirm}
        </Button>
      </form>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Business units
// ---------------------------------------------------------------------------

export function CreateBusinessUnitForm() {
  const id = useId();
  const [state, action, pending] = useActionState(createBusinessUnitAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2" noValidate>
      <div className="min-w-56 flex-1 space-y-2">
        <Label htmlFor={`${id}-name`}>{c.businessUnits.nameLabel}</Label>
        {/* React resets the form after the action; an error refills the name. */}
        <Input id={`${id}-name`} name="name" maxLength={80} defaultValue={state.values?.name} />
      </div>
      <Button type="submit" variant="accent" disabled={pending}>
        {c.businessUnits.create}
      </Button>
      <div className="w-full">
        <StateNotice state={state} />
      </div>
    </form>
  );
}

export function RenameBusinessUnitForm({ unit }: { unit: BusinessUnitOption }) {
  const id = useId();
  const [state, action, pending] = useActionState(renameBusinessUnitAction, {});
  return (
    <details className="text-sm" open={Boolean(state.error)}>
      <summary className="cursor-pointer text-accent">{c.businessUnits.rename}</summary>
      <form action={action} className="mt-2 flex flex-wrap items-end gap-2" noValidate>
        <input type="hidden" name="businessUnitId" value={unit.id} />
        <div className="space-y-1">
          <Label htmlFor={`${id}-name`} className="sr-only">
            {c.businessUnits.nameLabel}
          </Label>
          <Input id={`${id}-name`} name="name" defaultValue={unit.name} maxLength={80} />
        </div>
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {c.businessUnits.save}
        </Button>
        <div className="w-full">
          <StateNotice state={state} />
        </div>
      </form>
    </details>
  );
}

export function ArchiveBusinessUnitForm({ unitId }: { unitId: string }) {
  return (
    <ConfirmForm
      action={archiveBusinessUnitAction}
      summary={c.businessUnits.archive}
      title={c.businessUnits.archiveConfirmTitle}
      body={c.businessUnits.archiveConfirmBody}
      confirm={c.businessUnits.archive}
      hidden={{ businessUnitId: unitId }}
    />
  );
}

// ---------------------------------------------------------------------------
// Coordinators
// ---------------------------------------------------------------------------

export function CoordinatorUnitsForm({
  profileId,
  units,
  selected,
}: {
  profileId: string;
  units: readonly BusinessUnitOption[];
  selected: readonly string[];
}) {
  const [state, action, pending] = useActionState(setCoordinatorUnitsAction, {});
  return (
    <details className="text-sm" open={Boolean(state.error)}>
      <summary className="cursor-pointer text-accent">{c.coordinators.editUnits}</summary>
      <form action={action} className="mt-2 space-y-2" noValidate>
        <input type="hidden" name="profileId" value={profileId} />
        <fieldset className="space-y-1">
          <legend className="sr-only">{c.coordinators.unitsLabel}</legend>
          {units.map((unit) => (
            <label key={unit.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                name="unitIds"
                value={unit.id}
                defaultChecked={selected.includes(unit.id)}
              />
              {unit.name}
            </label>
          ))}
        </fieldset>
        <StateNotice state={state} />
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {c.coordinators.saveUnits}
        </Button>
      </form>
    </details>
  );
}

export function RemoveCoordinatorForm({ profileId }: { profileId: string }) {
  return (
    <ConfirmForm
      action={removeCoordinatorAction}
      summary={c.coordinators.remove}
      title={c.coordinators.removeConfirmTitle}
      body={c.coordinators.removeConfirmBody}
      confirm={c.coordinators.remove}
      hidden={{ profileId }}
    />
  );
}

// ---------------------------------------------------------------------------
// Moving units and operators; revoking invitations
// ---------------------------------------------------------------------------

/** "Mover a…" (the Gerente): the other active business units of the company. */
export function MoveForm({
  kind,
  id,
  currentUnitId,
  units,
}: {
  kind: 'vehicle' | 'operator';
  id: string;
  currentUnitId: string;
  units: readonly BusinessUnitOption[];
}) {
  const formId = useId();
  const [state, action, pending] = useActionState(moveFleetRowAction, {});
  const others = units.filter((unit) => unit.id !== currentUnitId);
  if (others.length === 0) return null;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2" noValidate>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <Label htmlFor={`${formId}-unit`} className="text-xs text-muted-foreground">
        {c.fleet.move}
      </Label>
      <select id={`${formId}-unit`} name="businessUnitId" defaultValue="" className={select}>
        <option value="" disabled />
        {others.map((unit) => (
          <option key={unit.id} value={unit.id}>
            {unit.name}
          </option>
        ))}
      </select>
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {c.fleet.moveSubmit}
      </Button>
      {(state.error ?? state.message) && (
        <div className="w-full">
          <StateNotice state={state} />
        </div>
      )}
    </form>
  );
}

/** "Dar de baja" a unit or an operator (the Gerente; refused with a trip in its hands). */
export function ArchiveFleetRowForm({ kind, id }: { kind: 'vehicle' | 'operator'; id: string }) {
  const copy = kind === 'vehicle' ? fleetCopy.units : fleetCopy.operators;
  return (
    <ConfirmForm
      action={archiveFleetRowAction}
      summary={c.fleet.archive}
      title={copy.archiveConfirmTitle}
      body={copy.archiveConfirmBody}
      confirm={c.fleet.archive}
      hidden={{ kind, id }}
    />
  );
}

export function RevokeInvitationForm({ invitationId }: { invitationId: string }) {
  const [state, action, pending] = useActionState(revokeInvitationAction, {});
  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="invitationId" value={invitationId} />
      <Button type="submit" variant="link" size="sm" className="px-0" disabled={pending}>
        {c.invitations.revoke}
      </Button>
      <StateNotice state={state} />
    </form>
  );
}
