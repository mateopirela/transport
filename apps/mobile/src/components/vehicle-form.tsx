import {
  fleetCopy,
  fleetErrorCopy,
  SPECIAL_REQUIREMENTS,
  specialRequirementLabels,
  toOptions,
  UNIT_TYPES,
  unitTypeLabels,
  VEHICLE_KINDS,
  vehicleFormSchema,
  vehicleKindLabels,
  type BusinessUnitRef,
} from '@transport/shared';
import { useState, type ReactNode } from 'react';

import { toggleItem, vehicleSchemaInput, type VehicleFormState } from '../lib/fleet-forms';
import { saveVehicle } from '../lib/fleet-api';
import { fleetErrorMessage } from '../lib/fleet-errors';
import { validateForm, type FieldErrors } from '../lib/forms';
import type { Supabase } from '../lib/supabase';
import { BusinessUnitChoice } from './business-unit-fields';
import { ChoiceCell, MultiChoiceCell } from './choice-cell';
import { Cell, FieldCell, Group, Notice } from './ui';

const copy = fleetCopy.units;
const KIND_OPTIONS = toOptions(VEHICLE_KINDS, vehicleKindLabels);
const UNIT_TYPE_OPTIONS = toOptions(UNIT_TYPES, unitTypeLabels);
const FEATURE_OPTIONS = toOptions(SPECIAL_REQUIREMENTS, specialRequirementLabels);

/** The save of a form: its label, what it does and whether it is running. */
export interface FormSave {
  label: string;
  onPress: () => void;
  loading: boolean;
  disabled?: boolean;
}

/**
 * Registers a unit or edits it (`vehicleId`): the fields in a group and the
 * save, which the screen shows as its primary action or as a secondary
 * button. The kind cannot change after registration. A new unit goes to the
 * business unit chosen among `businessUnits` (G4). Calls `onSaved` with the
 * unit id.
 */
export function useVehicleForm({
  client,
  companyId,
  vehicleId,
  initial,
  businessUnits = [],
  onSaved,
}: {
  client: Supabase;
  companyId: string;
  vehicleId: string | null;
  initial: VehicleFormState;
  businessUnits?: readonly BusinessUnitRef[];
  onSaved: (id: string) => void;
}): { section: ReactNode; save: FormSave } {
  const [form, setForm] = useState(initial);
  const [businessUnitId, setBusinessUnitId] = useState<string | undefined>();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const tractor = form.kind === 'tractor';

  const set = <K extends keyof VehicleFormState>(field: K, value: VehicleFormState[K]) =>
    setForm((current) => ({ ...current, [field]: value }));

  async function save() {
    setMessage(null);
    const parsed = validateForm(vehicleFormSchema, vehicleSchemaInput(form));
    const unitMissing = !vehicleId && businessUnits.length > 1 && !businessUnitId;
    setErrors({
      ...(parsed.ok ? {} : parsed.errors),
      ...(unitMissing ? { businessUnitId: fleetErrorCopy.businessUnitRequired } : {}),
    });
    if (!parsed.ok || unitMissing) return;
    setSaving(true);
    try {
      const id = await saveVehicle(
        client,
        parsed.data,
        vehicleId ? { id: vehicleId } : { companyId, businessUnitId },
      );
      setMessage({ tone: 'info', text: copy.saved });
      onSaved(id);
    } catch (error) {
      setMessage({ tone: 'danger', text: fleetErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  const section = (
    <>
      <Group>
        {vehicleId ? (
          <Cell icon="units" title={vehicleKindLabels[form.kind]} />
        ) : (
          <ChoiceCell
            label={copy.kindLabel}
            options={KIND_OPTIONS}
            value={form.kind}
            onChange={(kind) => {
              if (kind) set('kind', kind);
            }}
            error={errors.kind}
          />
        )}
        {vehicleId ? null : (
          <BusinessUnitChoice
            units={businessUnits}
            value={businessUnitId}
            onChange={setBusinessUnitId}
            error={errors.businessUnitId}
          />
        )}
        <FieldCell
          label={copy.plateLabel}
          value={form.plate}
          onChangeText={(text) => set('plate', text)}
          error={errors.plate}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <FieldCell
          label={copy.fleetNumberLabel}
          value={form.fleetNumber}
          onChangeText={(text) => set('fleetNumber', text)}
          error={errors.fleetNumber}
        />
        <FieldCell
          label={copy.modelYearLabel}
          value={form.modelYear}
          onChangeText={(text) => set('modelYear', text)}
          error={errors.modelYear}
          keyboardType="number-pad"
        />
        {tractor ? null : (
          <>
            <ChoiceCell
              label={copy.unitTypeLabel}
              options={UNIT_TYPE_OPTIONS}
              value={form.unitType}
              onChange={(unitType) => {
                if (unitType) set('unitType', unitType);
              }}
              error={errors.unitType}
            />
            <FieldCell
              label={copy.capacityKgLabel}
              value={form.capacityKg}
              onChangeText={(text) => set('capacityKg', text)}
              error={errors.capacityKg}
              keyboardType="number-pad"
            />
            <FieldCell
              label={copy.capacityM3Label}
              value={form.capacityM3}
              onChangeText={(text) => set('capacityM3', text)}
              error={errors.capacityM3}
              keyboardType="decimal-pad"
            />
          </>
        )}
        <MultiChoiceCell
          label={copy.featuresLabel}
          options={FEATURE_OPTIONS}
          values={form.features}
          onToggle={(feature) => set('features', toggleItem(form.features, feature))}
          error={errors.features}
        />
      </Group>
      {message ? (
        <Notice tone={message.tone === 'info' ? 'highlight' : 'danger'}>{message.text}</Notice>
      ) : null}
    </>
  );
  return { section, save: { label: copy.save, onPress: () => void save(), loading: saving } };
}
