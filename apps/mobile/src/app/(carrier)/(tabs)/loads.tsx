import {
  carrierLoadsCopy,
  carrierNegotiationState,
  cityPreset,
  CITY_PRESETS,
  toOptions,
  UNIT_TYPES,
  unitTypeLabels,
  type UnitType,
} from '@transport/shared';
import { useCallback, useState } from 'react';

import { ChoiceChips, Loaded, SectionTitle } from '../../../components/fleet-ui';
import { LoadCard } from '../../../components/load-card';
import { Body, Button, Screen, Title } from '../../../components/ui';
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

/** Tapping the selected chip again clears that filter. */
const toggle = <T,>(current: T | undefined, value: T) => (current === value ? undefined : value);

const loadNegotiations = ({ client, companyId }: CarrierContext) =>
  listNegotiations(client, companyId);

/** Open loads with filters, and the carrier's negotiations (B19). */
export default function LoadsTab() {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
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
    <Screen>
      <Title subtitle={copy.subtitle}>{copy.title}</Title>
      <ChoiceChips
        label={copy.origin}
        options={CITY_OPTIONS}
        value={filters.originId}
        onChange={(id) => setFilters((f) => ({ ...f, originId: toggle(f.originId, id) }))}
      />
      <ChoiceChips
        label={copy.destination}
        options={CITY_OPTIONS}
        value={filters.destinationId}
        onChange={(id) => setFilters((f) => ({ ...f, destinationId: toggle(f.destinationId, id) }))}
      />
      <ChoiceChips
        label={copy.unitType}
        options={UNIT_TYPE_OPTIONS}
        value={filters.unitType}
        onChange={(t) => setFilters((f) => ({ ...f, unitType: toggle(f.unitType, t) }))}
      />
      {Object.values(filters).some(Boolean) ? (
        <Button label={copy.clear} variant="link" onPress={() => setFilters(NO_FILTERS)} />
      ) : null}
      <Loaded state={results.state} onRetry={() => void results.reload()}>
        {(loads) =>
          loads.length === 0 ? (
            <Body>{copy.empty}</Body>
          ) : (
            <>
              <Body>{copy.results(loads.length)}</Body>
              {loads.map((load) => (
                <LoadCard key={load.id} load={load} />
              ))}
            </>
          )
        }
      </Loaded>

      <SectionTitle>{copy.negotiations}</SectionTitle>
      <Loaded state={negotiations.state} onRetry={() => void negotiations.reload()}>
        {(items) =>
          items.length === 0 ? (
            <Body>{copy.noNegotiations}</Body>
          ) : (
            items.map((n) => (
              <LoadCard
                key={n.negotiationId}
                load={n.load}
                footer={
                  carrierLoadsCopy.negotiation.states[
                    carrierNegotiationState(n.offers, n.load.status)
                  ]
                }
              />
            ))
          )
        }
      </Loaded>
    </Screen>
  );
}
