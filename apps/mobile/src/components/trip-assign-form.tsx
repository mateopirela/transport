import {
  canAssignTrip,
  carrierTripsCopy,
  checkAssignment,
  defaultAssignment,
  type SpecialRequirement,
  type TripStatus,
  type UnitType,
} from '@transport/shared';
import { useState } from 'react';
import { Alert } from 'react-native';

import { carrierTripErrorMessage } from '../lib/carrier-trip-errors';
import { assignTrip, type AssignmentOptions } from '../lib/carrier-trips-api';
import type { Supabase } from '../lib/supabase';
import { ChoiceChips, SectionTitle } from './fleet-ui';
import { Body, Button, Notice } from './ui';

const copy = carrierTripsCopy.assign;

/**
 * "Asignar operador" (B20): the unit and the operator of a won trip, until the
 * operator departs. assign_trip validates everything again and notifies the
 * operator; the form only explains beforehand what the server would reject.
 */
export function TripAssignForm({
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
}) {
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
  });

  if (!canAssignTrip(status)) {
    return (
      <>
        <SectionTitle>{copy.title}</SectionTitle>
        <Body>{copy.locked}</Body>
      </>
    );
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
    Alert.alert(copy.confirmTitle, copy.confirmBody(unit.name, operator.name), [
      { text: copy.cancel, style: 'cancel' },
      { text: copy.confirm, onPress: () => void submit(target) },
    ]);
  }

  const tagged = (name: string, tag: string | null) => (tag ? `${name} · ${tag}` : name);

  return (
    <>
      <SectionTitle>{copy.title}</SectionTitle>
      <Body>{assigned ? copy.reassignHelp : copy.help}</Body>
      {options.units.length === 0 ? <Notice tone="warning">{copy.noUnits}</Notice> : null}
      {options.operators.length === 0 ? <Notice tone="warning">{copy.noOperators}</Notice> : null}
      {options.units.length > 0 ? (
        <ChoiceChips
          label={copy.unit}
          options={options.units.map((u) => ({
            value: u.id,
            label: tagged(u.name, u.expiredDocuments ? copy.unitExpiredTag : null),
          }))}
          value={vehicleId ?? undefined}
          onChange={setVehicleId}
        />
      ) : null}
      {options.operators.length > 0 ? (
        <ChoiceChips
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
          onChange={setOperatorId}
        />
      ) : null}
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
      {done ? <Notice tone="info">{done}</Notice> : null}
      <Button
        label={assigned ? copy.resubmit : copy.submit}
        loading={saving}
        disabled={blockers.length > 0 || unchanged}
        onPress={confirm}
      />
    </>
  );
}
