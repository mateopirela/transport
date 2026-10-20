import {
  carrierLoadsCopy,
  carrierNegotiationState,
  cityPreset,
  CITY_PRESETS,
  formatMxn,
  sortOffers,
  toOptions,
  UNIT_TYPES,
  unitTypeLabels,
  type UnitType,
} from '@transport/shared';
import { useCallback, useRef, useState } from 'react';

import { LoadCell } from '../../../components/load-card';
import { OptionSheet, type SheetHandle } from '../../../components/sheet';
import {
  Button,
  Cell,
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

/** The label of the chosen option, or "Cualquiera". */
const chosen = <T extends string>(
  options: readonly { value: T; label: string }[],
  value: T | undefined,
) => options.find((o) => o.value === value)?.label ?? copy.any;

const loadNegotiations = ({ client, companyId }: CarrierContext) =>
  listNegotiations(client, companyId);

/** Open loads with filters, and the carrier's negotiations (B19). */
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
        <Group>
          <Cell
            role="link"
            title={copy.origin}
            value={chosen(CITY_OPTIONS, filters.originId)}
            onPress={() => originSheet.current?.open()}
          />
          <Cell
            role="link"
            title={copy.destination}
            value={chosen(CITY_OPTIONS, filters.destinationId)}
            onPress={() => destinationSheet.current?.open()}
          />
          <Cell
            role="link"
            title={copy.unitType}
            value={chosen(UNIT_TYPE_OPTIONS, filters.unitType)}
            onPress={() => unitTypeSheet.current?.open()}
          />
        </Group>
        {Object.values(filters).some(Boolean) ? (
          <Button label={copy.clear} variant="plain" onPress={() => setFilters(NO_FILTERS)} />
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
              const footer = carrierLoadsCopy.negotiation.states[state];
              if (n.load) return <LoadCell key={n.negotiationId} load={n.load} footer={footer} />;
              const latest = sortOffers(n.offers).at(-1);
              return (
                <Cell
                  key={n.negotiationId}
                  title={copy.unavailableLoad}
                  subtitle={[latest ? copy.lastOffer(formatMxn(latest.amount_cents)) : null, footer]
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
