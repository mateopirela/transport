'use client';

import {
  canAssignTrip,
  carrierTripsCopy,
  carrierWebCopy,
  checkAssignment,
  defaultAssignment,
  type SpecialRequirement,
  type TripStatus,
  type UnitType,
} from '@transport/shared';
import { useActionState, useId, useState } from 'react';

import { Notice } from '@/components/auth-forms';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { assignCarrierTrip } from '@/lib/carrier/trip-actions';
import type { AssignmentOptions } from '@/lib/carrier/trips';

const c = carrierWebCopy.trips.assign;
const app = carrierTripsCopy.assign;
const select = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm';

/**
 * "Asignar operador" (G10b; B20 on the app): the unit and the operator of a
 * won trip, until the operator departs. assign_trip validates everything
 * again (business unit, documents, license D16) and notifies the operator;
 * the form only explains beforehand what the server would reject, with the
 * same pure rules as the app (checkAssignment).
 */
export function TripAssignForm({
  tripId,
  status,
  loadUnitType,
  loadRequirements,
  current,
  options,
  isManager,
}: {
  tripId: string;
  status: TripStatus;
  loadUnitType: UnitType;
  /** Special requirements of the load (a hazmat permit needs a type E license, D16). */
  loadRequirements: readonly SpecialRequirement[];
  current: { vehicleId: string | null; operatorId: string | null };
  options: AssignmentOptions;
  /** The Gerente picks from every business unit; a Coordinador from the trip's. */
  isManager: boolean;
}) {
  const id = useId();
  const [state, action, pending] = useActionState(assignCarrierTrip, {});
  const initial = defaultAssignment({
    current,
    offeredUnitId: options.offeredUnitId,
    units: options.units,
    operators: options.operators,
  });
  const [vehicleId, setVehicleId] = useState(state.values?.vehicleId ?? initial.vehicleId ?? '');
  const [operatorId, setOperatorId] = useState(
    state.values?.operatorId ?? initial.operatorId ?? '',
  );
  const [confirming, setConfirming] = useState(false);

  const assigned = current.vehicleId !== null && current.operatorId !== null;
  const unit = options.units.find((u) => u.id === vehicleId) ?? null;
  const operator = options.operators.find((o) => o.id === operatorId) ?? null;
  const unchanged =
    assigned && vehicleId === current.vehicleId && operatorId === current.operatorId;
  const { blockers, warnings } = checkAssignment({
    unit,
    operator,
    loadUnitType,
    loadRequirements,
    licensePairs: options.licensePairs,
  });

  if (!canAssignTrip(status)) {
    return <p className="text-sm text-muted-foreground">{app.locked}</p>;
  }

  const tagged = (name: string, tag: string | null, businessUnit: string | null) =>
    [name, tag, isManager ? businessUnit : null].filter(Boolean).join(' · ');

  return (
    <form
      action={action}
      className="space-y-3"
      noValidate
      onSubmit={(event) => {
        // First click asks for confirmation; the second one submits.
        if (!confirming) {
          event.preventDefault();
          setConfirming(true);
        }
      }}
    >
      <p className="text-sm text-muted-foreground">{assigned ? app.reassignHelp : app.help}</p>
      <p className="text-xs text-muted-foreground">
        {isManager ? c.managerHint : c.coordinatorHint}
      </p>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.message && <Notice tone="success">{state.message}</Notice>}
      {options.units.length === 0 && <Notice tone="info">{app.noUnits}</Notice>}
      {options.operators.length === 0 && <Notice tone="info">{app.noOperators}</Notice>}
      <input type="hidden" name="tripId" value={tripId} />
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-unit`}>{c.unit}</Label>
        <select
          id={`${id}-unit`}
          name="vehicleId"
          value={vehicleId}
          onChange={(event) => {
            setVehicleId(event.target.value);
            setConfirming(false);
          }}
          className={select}
        >
          <option value="">{c.choose}</option>
          {options.units.map((u) => (
            <option key={u.id} value={u.id}>
              {tagged(u.name, u.expiredDocuments ? app.unitExpiredTag : null, u.businessUnitName)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-operator`}>{c.operator}</Label>
        <select
          id={`${id}-operator`}
          name="operatorId"
          value={operatorId}
          onChange={(event) => {
            setOperatorId(event.target.value);
            setConfirming(false);
          }}
          className={select}
        >
          <option value="">{c.choose}</option>
          {options.operators.map((o) => (
            <option key={o.id} value={o.id}>
              {tagged(
                o.name,
                !o.hasAccount
                  ? app.noAccountTag
                  : o.licenseType
                    ? app.licenseTag(o.licenseType, o.licenseCurrent)
                    : app.noLicenseTag,
                o.businessUnitName,
              )}
            </option>
          ))}
        </select>
      </div>
      {blockers
        .filter((b) => b !== 'missingSelection')
        .map((b) => (
          <Notice key={b} tone="error">
            {app.blockers[b]}
          </Notice>
        ))}
      {warnings.map((w) => (
        <Notice key={w} tone="info">
          {app.warnings[w]}
        </Notice>
      ))}
      {confirming && unit && operator ? (
        <div className="space-y-2 rounded-md border border-accent/30 bg-accent/5 p-3 text-sm">
          <p className="font-medium">{c.confirmTitle}</p>
          <p>{app.confirmBody(unit.name, operator.name)}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="accent" size="sm" disabled={pending}>
              {pending ? c.submitting : c.confirm}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              {c.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="submit"
          variant="accent"
          disabled={pending || blockers.length > 0 || unchanged}
        >
          {assigned ? c.resubmit : c.submit}
        </Button>
      )}
    </form>
  );
}
