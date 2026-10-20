import {
  canAssignTrip,
  carrierTripsCopy,
  checkAssignment,
  defaultAssignment,
  type SpecialRequirement,
  type TripStatus,
  type UnitType,
} from '@transport/shared';
import { useRef, useState, type ComponentProps, type ReactNode } from 'react';

import { carrierTripErrorMessage } from '../lib/carrier-trip-errors';
import { assignTrip, type AssignmentOptions } from '../lib/carrier-trips-api';
import type { Supabase } from '../lib/supabase';
import { ChoiceCell } from './choice-cell';
import { ConfirmSheet, type ConfirmSheetHandle } from './sheet';
import { type BottomBar, Footnote, Group, Notice, SectionHeader, TextCell } from './ui';

const copy = carrierTripsCopy.assign;

type BarAction = ComponentProps<typeof BottomBar>['action'];

/**
 * "Asignar operador" (B20): the unit and the operator of a won trip, until the
 * operator departs. assign_trip validates everything again and notifies the
 * operator; the form only explains beforehand what the server would reject.
 *
 * Returns the section for the screen and, while the trip can be assigned,
 * the screen's primary action for its BottomBar, confirmed in a sheet.
 */
export function useTripAssignment({
  client,
  tripId,
  status,
  loadUnitType,
  loadRequirements,
  current,
  options,
  onAssigned,
}: {
  client: Supabase;
  tripId: string;
  status: TripStatus;
  loadUnitType: UnitType;
  /** Special requirements of the load (a hazmat permit needs a type E license, D16). */
  loadRequirements: readonly SpecialRequirement[];
  current: { vehicleId: string | null; operatorId: string | null };
  options: AssignmentOptions;
  onAssigned: () => Promise<void>;
}): { section: ReactNode; action: BarAction | null } {
  const confirmSheet = useRef<ConfirmSheetHandle>(null);
  const initial = defaultAssignment({
    current,
    offeredUnitId: options.offeredUnitId,
    units: options.units,
    operators: options.operators,
  });
  const [vehicleId, setVehicleId] = useState(initial.vehicleId);
  const [operatorId, setOperatorId] = useState(initial.operatorId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

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
    return {
      section: (
        <>
          <SectionHeader title={copy.title} />
          <Group>
            <TextCell tone="dim">{copy.locked}</TextCell>
          </Group>
        </>
      ),
      action: null,
    };
  }

  async function submit(target: { vehicleId: string; operatorId: string; operatorName: string }) {
    setSaving(true);
    setError(null);
    setDone(null);
    try {
      await assignTrip(client, tripId, target.vehicleId, target.operatorId);
      setDone(copy.done(target.operatorName));
      await onAssigned();
    } catch (e) {
      setError(carrierTripErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  function confirm() {
    if (!unit || !operator || blockers.length > 0) return;
    const target = { vehicleId: unit.id, operatorId: operator.id, operatorName: operator.name };
    confirmSheet.current?.ask({
      title: copy.confirmTitle,
      body: copy.confirmBody(unit.name, operator.name),
      confirmLabel: copy.confirm,
      cancelLabel: copy.cancel,
      onConfirm: () => submit(target),
    });
  }

  const tagged = (name: string, tag: string | null) => (tag ? `${name} · ${tag}` : name);

  const hasChoices = options.units.length > 0 || options.operators.length > 0;
  const section = (
    <>
      <SectionHeader title={copy.title} />
      {options.units.length === 0 ? <Notice tone="warning">{copy.noUnits}</Notice> : null}
      {options.operators.length === 0 ? <Notice tone="warning">{copy.noOperators}</Notice> : null}
      {hasChoices ? (
        <Group>
          {options.units.length > 0 ? (
            <ChoiceCell
              label={copy.unit}
              options={options.units.map((u) => ({
                value: u.id,
                label: tagged(u.name, u.expiredDocuments ? copy.unitExpiredTag : null),
              }))}
              value={vehicleId ?? undefined}
              onChange={(next) => {
                if (next) setVehicleId(next);
              }}
            />
          ) : null}
          {options.operators.length > 0 ? (
            <ChoiceCell
              label={copy.operator}
              options={options.operators.map((o) => ({
                value: o.id,
                label: tagged(
                  o.name,
                  !o.hasAccount
                    ? copy.noAccountTag
                    : o.licenseType
                      ? copy.licenseTag(o.licenseType, o.licenseCurrent)
                      : copy.noLicenseTag,
                ),
              }))}
              value={operatorId ?? undefined}
              onChange={(next) => {
                if (next) setOperatorId(next);
              }}
            />
          ) : null}
        </Group>
      ) : null}
      <Footnote>{assigned ? copy.reassignHelp : copy.help}</Footnote>
      {blockers
        .filter((b) => b !== 'missingSelection')
        .map((b) => (
          <Notice key={b} tone="danger">
            {copy.blockers[b]}
          </Notice>
        ))}
      {warnings.map((w) => (
        <Notice key={w} tone="warning">
          {copy.warnings[w]}
        </Notice>
      ))}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {done ? <Notice>{done}</Notice> : null}
      <ConfirmSheet ref={confirmSheet} />
    </>
  );
  return {
    section,
    action: {
      label: assigned ? copy.resubmit : copy.submit,
      onPress: confirm,
      loading: saving,
      disabled: blockers.length > 0 || unchanged,
    },
  };
}
