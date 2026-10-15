import {
  carrierRouteFormSchema,
  CITY_PRESETS,
  fleetCopy,
  toOptions,
  UNIT_TYPES,
  unitTypeLabels,
  type UnitType,
} from '@transport/shared';
import { Stack } from 'expo-router';
import { useState } from 'react';

import { Card, ChoiceChips, Loaded, MultiChips, SectionTitle } from '../../components/fleet-ui';
import { Body, Button, Notice, Screen } from '../../components/ui';
import { addRoute, archiveRoute, listRoutes } from '../../lib/fleet-api';
import { fleetErrorMessage } from '../../lib/fleet-errors';
import { toggleItem } from '../../lib/fleet-forms';
import { validateForm, type FieldErrors } from '../../lib/forms';
import { useCarrierData, type CarrierContext } from '../../lib/use-carrier';

const copy = fleetCopy.routes;
const CITY_OPTIONS = CITY_PRESETS.map((c) => ({ value: c.id, label: c.city }));
const UNIT_TYPE_OPTIONS = toOptions(UNIT_TYPES, unitTypeLabels);

const loadRoutes = ({ client, companyId }: CarrierContext) => listRoutes(client, companyId);

/** Usual routes of the carrier, used for recommendations and return trips (B18). */
export default function Routes() {
  const { carrier, state, reload } = useCarrierData(loadRoutes);
  const [values, setValues] = useState<{
    originId: string | undefined;
    destinationId: string | undefined;
    unitTypes: UnitType[];
  }>({ originId: 'mty', destinationId: 'gdl', unitTypes: [] });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
    } catch (e) {
      setError(fleetErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function add() {
    if (!carrier) return;
    const parsed = validateForm(carrierRouteFormSchema, values);
    setErrors(parsed.ok ? {} : parsed.errors);
    if (parsed.ok) void run(() => addRoute(carrier.client, carrier.companyId, parsed.data));
  }

  return (
    <Screen belowHeader>
      <Stack.Screen options={{ title: copy.title }} />
      <Body>{copy.subtitle}</Body>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Loaded state={state} onRetry={() => void reload()}>
        {(routes) =>
          routes.length === 0 ? (
            <Body>{copy.empty}</Body>
          ) : (
            routes.map((route) => (
              <Card
                key={route.id}
                title={copy.item(route.origin_city, route.destination_city)}
                subtitle={route.unit_types.map((t) => unitTypeLabels[t]).join(', ') || null}
              >
                <Button
                  label={copy.remove}
                  variant="link"
                  disabled={busy || !carrier}
                  onPress={() => carrier && void run(() => archiveRoute(carrier.client, route.id))}
                />
              </Card>
            ))
          )
        }
      </Loaded>
      <SectionTitle>{copy.add}</SectionTitle>
      <ChoiceChips
        label={copy.originLabel}
        options={CITY_OPTIONS}
        value={values.originId}
        onChange={(originId) => setValues((v) => ({ ...v, originId }))}
        error={errors.originId}
      />
      <ChoiceChips
        label={copy.destinationLabel}
        options={CITY_OPTIONS}
        value={values.destinationId}
        onChange={(destinationId) => setValues((v) => ({ ...v, destinationId }))}
        error={errors.destinationId}
      />
      <MultiChips
        label={copy.unitTypesLabel}
        options={UNIT_TYPE_OPTIONS}
        values={values.unitTypes}
        onToggle={(t) => setValues((v) => ({ ...v, unitTypes: toggleItem(v.unitTypes, t) }))}
        error={errors.unitTypes}
      />
      <Button label={copy.save} onPress={add} loading={busy} disabled={!carrier} />
    </Screen>
  );
}
