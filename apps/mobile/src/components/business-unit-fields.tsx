import { carrierWebCopy, managerCompanyCopy, type BusinessUnitRef } from '@transport/shared';
import { useState } from 'react';

import { companyErrorMessage } from '../lib/fleet-errors';
import { ChoiceCell } from './choice-cell';
import { Button, Group, Notice } from './ui';

/**
 * Business unit of a new unit or operator (G4), as a row of the form's group:
 * the units the user operates, as chips. With a single one there is nothing
 * to choose (the default_business_unit trigger takes it), so nothing is shown.
 */
export function BusinessUnitChoice({
  units,
  value,
  onChange,
  error,
}: {
  units: readonly BusinessUnitRef[];
  value: string | undefined;
  onChange: (id: string) => void;
  error?: string | undefined;
}) {
  if (units.length < 2) return null;
  return (
    <ChoiceCell
      label={carrierWebCopy.fleet.businessUnitField}
      options={units.map((u) => ({ value: u.id, label: u.name }))}
      value={value}
      onChange={(id) => {
        if (id) onChange(id);
      }}
      error={error}
    />
  );
}

/**
 * "Mover a…" (G4, the Gerente): moves a unit or an operator to another
 * business unit with move_vehicle_to_unit / move_operator_to_unit, which
 * refuse it while it is committed to a trip.
 */
export function MoveToBusinessUnit({
  units,
  currentId,
  move,
  onMoved,
}: {
  units: readonly BusinessUnitRef[];
  currentId: string;
  move: (unitId: string) => Promise<void>;
  onMoved: () => void | Promise<void>;
}) {
  const [target, setTarget] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);
  const others = units.filter((u) => u.id !== currentId);
  if (others.length === 0) return null;

  async function submit() {
    if (!target) return;
    setBusy(true);
    setMessage(null);
    try {
      await move(target);
      setTarget(undefined);
      setMessage({ tone: 'info', text: managerCompanyCopy.fleet.moved });
      await onMoved();
    } catch (error) {
      setMessage({ tone: 'danger', text: companyErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Group>
        <ChoiceCell
          label={managerCompanyCopy.fleet.move}
          options={others.map((u) => ({ value: u.id, label: u.name }))}
          value={target}
          onChange={setTarget}
        />
      </Group>
      {message ? (
        <Notice tone={message.tone === 'info' ? 'highlight' : 'danger'}>{message.text}</Notice>
      ) : null}
      {target ? (
        <Button
          label={managerCompanyCopy.fleet.moveSubmit}
          variant="secondary"
          onPress={() => void submit()}
          loading={busy}
        />
      ) : null}
    </>
  );
}
