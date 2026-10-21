import {
  carrierRouteFormSchema,
  CITY_PRESETS,
  findCityPreset,
  fleetCopy,
  ROAD_PREFERENCES,
  roadPreferenceLabels,
  roadsCopy,
  segmentsForRoute,
  toOptions,
  UNIT_TYPES,
  unitTypeLabels,
  type RoadPreference,
  type UnitType,
} from '@transport/shared';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { KeyboardBottomBar } from '../../components/keyboard-bar';
import { ChoiceCell, MultiChoiceCell } from '../../components/choice-cell';
import {
  Button,
  Cell,
  Footnote,
  Group,
  LoadError,
  Notice,
  Screen,
  SectionHeader,
  Skeleton,
  TextCell,
} from '../../components/ui';
import { addRoute, archiveRoute, listRoutes } from '../../lib/fleet-api';
import { fleetErrorMessage } from '../../lib/fleet-errors';
import { listRoadPreferences, loadRoadContext, setRoadPreference } from '../../lib/roads-api';
import { toggleItem } from '../../lib/fleet-forms';
import { validateForm, type FieldErrors } from '../../lib/forms';
import { useCarrierData, type CarrierContext } from '../../lib/use-carrier';

const copy = fleetCopy.routes;
const CITY_OPTIONS = CITY_PRESETS.map((c) => ({ value: c.id, label: c.city }));
const UNIT_TYPE_OPTIONS = toOptions(UNIT_TYPES, unitTypeLabels);

const PREFERENCE_OPTIONS = toOptions(ROAD_PREFERENCES, roadPreferenceLabels);

async function loadRoutes({ client, companyId }: CarrierContext) {
  const [routes, roads, preferences] = await Promise.all([
    listRoutes(client, companyId),
    loadRoadContext(client),
    // H4: the preferred and avoided segments of each route.
    listRoadPreferences(client, companyId).catch(() => []),
  ]);
  return {
    routes,
    // Per route, the segments of the catalog's corridors that serve it
    // (routes are stored as city presets, so their points are known).
    roads: routes.map((route) => ({
      route,
      segments: segmentsForRoute(
        roads.corridors,
        findCityPreset(route.origin_city, route.origin_state) ?? null,
        findCityPreset(route.destination_city, route.destination_state) ?? null,
      ),
      marked: new Map<string, RoadPreference>(
        preferences
          .filter((p) => p.carrierRouteId === route.id)
          .map((p) => [p.segmentId, p.preference]),
      ),
    })),
  };
}

/** Usual routes of the carrier, used for recommendations and return trips (B18). */
export default function Routes() {
  const { carrier, state, reload } = useCarrierData(loadRoutes);
  const [barHeight, setBarHeight] = useState(0);
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
    <>
      <Screen belowHeader bottom={barHeight}>
        <Stack.Screen options={{ title: copy.title }} />
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {state.status === 'loading' ? (
          <Skeleton />
        ) : state.status === 'error' ? (
          <LoadError onRetry={() => void reload()} />
        ) : state.data.routes.length === 0 ? (
          <Group>
            <TextCell tone="dim">{copy.empty}</TextCell>
          </Group>
        ) : (
          <Group>
            {state.data.routes.map((route) => (
              <Cell
                key={route.id}
                title={copy.item(route.origin_city, route.destination_city)}
                subtitle={route.unit_types.map((t) => unitTypeLabels[t]).join(', ') || null}
                trailing={
                  <Button
                    label={copy.remove}
                    variant="plain"
                    size="small"
                    disabled={busy || !carrier}
                    onPress={() =>
                      carrier && void run(() => archiveRoute(carrier.client, route.id))
                    }
                  />
                }
              />
            ))}
          </Group>
        )}
        <Footnote>{copy.subtitle}</Footnote>

        {state.status === 'ready'
          ? state.data.roads
              .filter(({ segments }) => segments.length > 0)
              .map(({ route, segments, marked }) => (
                <View key={route.id}>
                  <SectionHeader
                    title={roadsCopy.preferences.forRoute(
                      copy.item(route.origin_city, route.destination_city),
                    )}
                  />
                  <Group>
                    {segments.map((segment) => (
                      <ChoiceCell
                        key={segment.id}
                        label={
                          segment.highway ? `${segment.name} · ${segment.highway}` : segment.name
                        }
                        options={PREFERENCE_OPTIONS}
                        value={marked.get(segment.id)}
                        clearable
                        onChange={(preference) =>
                          carrier &&
                          void run(() =>
                            setRoadPreference(
                              carrier.client,
                              route.id,
                              segment.id,
                              preference ?? null,
                            ),
                          )
                        }
                      />
                    ))}
                  </Group>
                  <Footnote>{roadsCopy.preferences.hint}</Footnote>
                </View>
              ))
          : null}

        <SectionHeader title={copy.add} />
        <Group>
          <ChoiceCell
            label={copy.originLabel}
            options={CITY_OPTIONS}
            value={values.originId}
            onChange={(originId) => setValues((v) => ({ ...v, originId }))}
            error={errors.originId}
          />
          <ChoiceCell
            label={copy.destinationLabel}
            options={CITY_OPTIONS}
            value={values.destinationId}
            onChange={(destinationId) => setValues((v) => ({ ...v, destinationId }))}
            error={errors.destinationId}
          />
          <MultiChoiceCell
            label={copy.unitTypesLabel}
            options={UNIT_TYPE_OPTIONS}
            values={values.unitTypes}
            onToggle={(t) => setValues((v) => ({ ...v, unitTypes: toggleItem(v.unitTypes, t) }))}
            error={errors.unitTypes}
          />
        </Group>
      </Screen>
      <KeyboardBottomBar
        action={{ label: copy.save, onPress: add, loading: busy, disabled: !carrier }}
        onHeight={setBarHeight}
      />
    </>
  );
}
