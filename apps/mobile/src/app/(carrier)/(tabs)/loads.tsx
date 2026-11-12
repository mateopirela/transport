import {
  carrierAppCopy,
  carrierLoadsCopy,
  carrierNegotiationState,
  cityPreset,
  CITY_PRESETS,
  formatMoney,
  sortOffers,
  toOptions,
  UNIT_TYPES,
  unitTypeLabels,
  type UnitType,
} from '@transport/shared';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { LoadCell } from '../../../components/load-card';
import { OptionSheet, type SheetHandle } from '../../../components/sheet';
import {
  Button,
  Cell,
  Chip,
  Group,
  GroupLabel,
  LoadError,
  Screen,
  SectionHeader,
  Skeleton,
  TextCell,
} from '../../../components/ui';
import { listNegotiations, searchLoads } from '../../../lib/loads-api';
import { useCarrierData, type CarrierContext } from '../../../lib/use-carrier';
import { spacing } from '../../../theme';

const copy = carrierLoadsCopy.search;
const CITY_OPTIONS = CITY_PRESETS.map((c) => ({ value: c.id, label: c.city }));
const UNIT_TYPE_OPTIONS = toOptions(UNIT_TYPES, unitTypeLabels);

interface Filters {
  originId: string | undefined;
  destinationId: string | undefined;
  unitType: UnitType | undefined;
}

const NO_FILTERS: Filters = { originId: undefined, destinationId: undefined, unitType: undefined };

/** Choosing the selected option again clears that filter. */
const toggle = <T,>(current: T | undefined, value: T) => (current === value ? undefined : value);

/** A filter's chip: its name alone, or "Origen: Monterrey" once chosen. */
const chipLabel = <T extends string>(
  filter: string,
  options: readonly { value: T; label: string }[],
  value: T | undefined,
) => {
  const label = options.find((o) => o.value === value)?.label;
  return label ? carrierAppCopy.loads.chosen(filter, label) : filter;
};

const loadNegotiations = ({ client, companyId }: CarrierContext) =>
  listNegotiations(client, companyId);

/**
 * Open loads with filters, and the carrier's negotiations (B19). The filters
 * are chips that open their choices in a sheet; each load reads its route
 * with its freight beside it, and each negotiation whose turn it is.
 */
export default function LoadsTab() {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const originSheet = useRef<SheetHandle>(null);
  const destinationSheet = useRef<SheetHandle>(null);
  const unitTypeSheet = useRef<SheetHandle>(null);
  const search = useCallback(
    ({ client }: CarrierContext) =>
      searchLoads(client, {
        origin: filters.originId ? cityPreset(filters.originId) : undefined,
        destination: filters.destinationId ? cityPreset(filters.destinationId) : undefined,
        unitType: filters.unitType,
      }),
    [filters],
  );
  const results = useCarrierData(search);
  const negotiations = useCarrierData(loadNegotiations);

  return (
    <>
      <Screen title={copy.title} subtitle={copy.subtitle}>
        <GroupLabel>{carrierAppCopy.loads.filters}</GroupLabel>
        <View style={styles.chips}>
          <Chip
            label={chipLabel(copy.origin, CITY_OPTIONS, filters.originId)}
            selected={filters.originId !== undefined}
            onPress={() => originSheet.current?.open()}
          />
          <Chip
            label={chipLabel(copy.destination, CITY_OPTIONS, filters.destinationId)}
            selected={filters.destinationId !== undefined}
            onPress={() => destinationSheet.current?.open()}
          />
          <Chip
            label={chipLabel(copy.unitType, UNIT_TYPE_OPTIONS, filters.unitType)}
            selected={filters.unitType !== undefined}
            onPress={() => unitTypeSheet.current?.open()}
          />
        </View>
        {Object.values(filters).some(Boolean) ? (
          <View style={styles.clear}>
            <Button
              label={copy.clear}
              variant="plain"
              size="small"
              onPress={() => setFilters(NO_FILTERS)}
            />
          </View>
        ) : null}

        {results.state.status === 'loading' ? (
          <Skeleton />
        ) : results.state.status === 'error' ? (
          <LoadError onRetry={() => void results.reload()} />
        ) : results.state.data.length === 0 ? (
          <Group>
            <TextCell tone="dim">{copy.empty}</TextCell>
          </Group>
        ) : (
          <>
            <GroupLabel>{copy.results(results.state.data.length)}</GroupLabel>
            <Group>
              {results.state.data.map((load) => (
                <LoadCell key={load.id} load={load} />
              ))}
            </Group>
          </>
        )}

        <SectionHeader title={copy.negotiations} />
        {negotiations.state.status === 'loading' ? (
          <Skeleton />
        ) : negotiations.state.status === 'error' ? (
          <LoadError onRetry={() => void negotiations.reload()} />
        ) : negotiations.state.data.length === 0 ? (
          <Group>
            <TextCell tone="dim">{copy.noNegotiations}</TextCell>
          </Group>
        ) : (
          <Group>
            {negotiations.state.data.map((n) => {
              // Hidden load: contracted with another carrier (loads_select).
              const state = carrierNegotiationState(n.offers, n.load?.status ?? 'contracted');
              if (n.load) return <LoadCell key={n.negotiationId} load={n.load} state={state} />;
              const latest = sortOffers(n.offers).at(-1);
              return (
                <Cell
                  key={n.negotiationId}
                  title={copy.unavailableLoad}
                  subtitle={[
                    latest ? copy.lastOffer(formatMoney(latest.amount_cents)) : null,
                    carrierLoadsCopy.negotiation.states[state],
                  ]
                    .filter(Boolean)
                    .join('\n')}
                />
              );
            })}
          </Group>
        )}
      </Screen>

      <OptionSheet
        ref={originSheet}
        title={copy.origin}
        options={CITY_OPTIONS}
        value={filters.originId}
        onChange={(id) => setFilters((f) => ({ ...f, originId: toggle(f.originId, id) }))}
      />
      <OptionSheet
        ref={destinationSheet}
        title={copy.destination}
        options={CITY_OPTIONS}
        value={filters.destinationId}
        onChange={(id) => setFilters((f) => ({ ...f, destinationId: toggle(f.destinationId, id) }))}
      />
      <OptionSheet
        ref={unitTypeSheet}
        title={copy.unitType}
        options={UNIT_TYPE_OPTIONS}
        value={filters.unitType}
        onChange={(t) => setFilters((f) => ({ ...f, unitType: toggle(f.unitType, t) }))}
      />
    </>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  clear: { alignItems: 'flex-start', marginTop: -spacing.sm },
});
