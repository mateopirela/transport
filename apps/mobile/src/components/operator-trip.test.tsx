import {
  operatorNextStepCopy,
  operatorStepActionLabels,
  palette,
  shape,
  TRIP_STATUSES,
} from '@transport/shared';
import { act, type ReactElement } from 'react';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { nextStep } from '../lib/next-step';
import type { TripLoad } from '../lib/trip-api';
import { NextStepBlock } from './operator-trip';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// react-test-renderer warns that it is deprecated on every render; nothing else is silenced.
const consoleError = console.error;
beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes('react-test-renderer is deprecated')) return;
    consoleError(...args);
  });
});
afterAll(() => vi.restoreAllMocks());

let renderer: ReactTestRenderer | undefined;

async function render(element: ReactElement): Promise<ReactTestInstance> {
  const made = await act(async () => create(element));
  renderer = made;
  return made.root;
}

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
});

const buttons = (root: ReactTestInstance) =>
  root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'button');
const styleOf = (node: ReactTestInstance): Record<string, unknown> =>
  [node.props.style]
    .flat(Infinity)
    .reduce<Record<string, unknown>>((all, s) => (s ? { ...all, ...s } : all), {});
const isType = (node: ReactTestInstance, type: string) => node.type === type;
const textOf = (node: ReactTestInstance): string =>
  node
    .findAll((n) => isType(n, 'Text'))
    .flatMap((n) => n.children.filter((c) => typeof c === 'string'))
    .join(' ');

const load: TripLoad = {
  origin_address: 'Av. Santa Rosa 300',
  origin_city: 'Apodaca',
  origin_state: 'Nuevo León',
  origin_lat: 25.77,
  origin_lng: -100.17,
  destination_address: 'Calle 2 No. 1250',
  destination_city: 'Guadalajara',
  destination_state: 'Jalisco',
  destination_lat: 20.63,
  destination_lng: -103.36,
  pickup_window_start: '2026-11-12T20:00:00Z',
  pickup_window_end: '2026-11-13T02:00:00Z',
  delivery_window_start: '2026-11-13T20:00:00Z',
  delivery_window_end: '2026-11-14T04:00:00Z',
  cargo_type: 'palletized',
  description: 'Película estirable en tarimas',
  weight_kg: 6500,
  special_requirements: [],
  notes: null,
};

function block(status: (typeof TRIP_STATUSES)[number], disabled = false) {
  return (
    <NextStepBlock
      load={load}
      step={nextStep(status)}
      busy={false}
      disabled={disabled}
      onStep={() => undefined}
      fallback={{ label: 'Actualizar', onPress: () => undefined }}
      onReport={() => undefined}
    />
  );
}

describe('NextStepBlock', () => {
  it('holds exactly one primary, 56 high, in every state of a trip', async () => {
    for (const status of TRIP_STATUSES) {
      const root = await render(block(status));
      const filled = buttons(root).filter(
        (n) => styleOf(n).backgroundColor === palette.dark.accent,
      );
      expect(filled, status).toHaveLength(1);
      expect(styleOf(filled[0] as ReactTestInstance).minHeight).toBe(shape.buttonHeightPrimary);
      const step = nextStep(status);
      expect(textOf(filled[0] as ReactTestInstance)).toBe(step.action ?? 'Actualizar');
      act(() => renderer?.unmount());
      renderer = undefined;
    }
  });

  it('keeps "Reportar incidencia" right under the step, then "Cómo llegar"', async () => {
    const root = await render(block('in_transit'));
    const labels = buttons(root).map(textOf);
    expect(labels).toEqual([
      operatorStepActionLabels.arrived_at_delivery,
      operatorNextStepCopy.report,
      operatorNextStepCopy.directions,
    ]);
    // "Cómo llegar" says where it goes to a screen reader.
    expect(buttons(root)[2]?.props.accessibilityLabel).toBe('Cómo llegar a Guadalajara');
  });

  it('drops "Cómo llegar" once delivered and keeps "Reportar incidencia"', async () => {
    const root = await render(block('delivered'));
    expect(buttons(root).map(textOf)).toEqual(['Actualizar', operatorNextStepCopy.report]);
  });

  it('names the step and where it happens', async () => {
    const root = await render(block('assigned'));
    const all = textOf(root);
    expect(all).toContain(operatorNextStepCopy.titles.departed);
    expect(all).toContain('Apodaca, Nuevo León · Av. Santa Rosa 300');
  });

  it('keeps the primary but disables it while the step waits (photos still missing)', async () => {
    const root = await render(block('loading', true));
    const primary = buttons(root)[0] as ReactTestInstance;
    expect(primary.props.accessibilityState).toMatchObject({ disabled: true });
  });
});
