import {
  cargoInsuranceCopy as c,
  formatDate,
  formatDateTime,
  type CargoInsuranceState,
} from '@transport/shared';

import { Cell, Footnote, Group, SectionHeader, type PillTone } from './ui';

const tones: Record<CargoInsuranceState['kind'], PillTone> = {
  trip_policy: 'ok',
  annual_policy: 'ok',
  missing: 'amber',
  not_required: 'neutral',
};

/** The line that says how the trip is (or is not) insured. */
export function cargoInsuranceText(state: CargoInsuranceState): string {
  switch (state.kind) {
    case 'trip_policy':
      return c.state.trip_policy(formatDateTime(state.uploadedAt));
    case 'annual_policy':
      return c.state.annual_policy(formatDate(state.expiresAt));
    case 'missing':
      return c.state.missing;
    case 'not_required':
      return c.state.not_required;
  }
}

/**
 * "Seguro de la mercancía" in the trip of the carrier staff (I1, D35-E1):
 * whether the shipper proved the insurance, and whether the trip may leave
 * without it. The policy itself is the shipper's: never shown here.
 */
export function CargoInsuranceSection({ state }: { state: CargoInsuranceState }) {
  const missing = state.kind === 'missing';
  return (
    <>
      <SectionHeader title={c.title} />
      <Footnote>{c.carrierHelp}</Footnote>
      <Group>
        <Cell
          title={cargoInsuranceText(state)}
          subtitle={missing ? (state.blocksDeparture ? c.blocks : c.warnsOnly) : null}
          pill={{ label: c.pill[state.kind], tone: tones[state.kind] }}
          lines={2}
        />
      </Group>
    </>
  );
}
