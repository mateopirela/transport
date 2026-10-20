import { palette } from '@transport/shared';
import { act } from 'react';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { DetailRow } from './detail-row';

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

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
});

/** The flattened style of a host element. */
const styleOf = (node: ReactTestInstance): Record<string, unknown> =>
  [node.props.style]
    .flat(Infinity)
    .reduce<Record<string, unknown>>((all, s) => (s ? { ...all, ...s } : all), {});

describe('DetailRow', () => {
  it('shows the label above the value, the label dim and the value in the text colour', async () => {
    renderer = await act(async () =>
      create(<DetailRow label="Ventana de recolección" value="12 oct, 08:00 – 12 oct, 12:00" />),
    );
    const [label, value] = renderer.root.findAll((n) => String(n.type) === 'Text');
    expect(label?.children).toEqual(['Ventana de recolección']);
    expect(value?.children).toEqual(['12 oct, 08:00 – 12 oct, 12:00']);
    expect(label && styleOf(label).color).toBe(palette.light.textDim);
    expect(value && styleOf(value).color).toBe(palette.light.text);
  });
});
