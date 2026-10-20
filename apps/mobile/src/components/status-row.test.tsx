import { toneColors } from '@transport/shared';
import { act, type ReactElement } from 'react';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { glyphOf } from './icons';
import { StatusRow } from './status-row';

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

const texts = (root: ReactTestInstance) =>
  root
    .findAll((n) => String(n.type) === 'Text')
    .flatMap((n) => n.children.filter((c) => typeof c === 'string'));
const links = (root: ReactTestInstance) =>
  root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'link');
const chevrons = (root: ReactTestInstance) =>
  root.findAll((n) => String(n.type) === 'Ionicons' && n.props.name === glyphOf('chevronRight'));

describe('StatusRow', () => {
  it('reads its title, its lines (skipping empty ones) and then its pill', async () => {
    const root = await render(
      <StatusRow
        title="TT-01"
        lines={['Tractocamión', null, 'Monterrey, Nuevo León']}
        pill={{ label: 'Disponible', tone: 'ok' }}
      />,
    );
    expect(texts(root)).toEqual(['TT-01', 'Tractocamión', 'Monterrey, Nuevo León', 'Disponible']);
    // The pill is the tone's text on its tint (the kit's Pill).
    const pill = root.findAll((n) => String(n.type) === 'Text').at(-1);
    expect([pill?.props.style].flat(Infinity)).toContainEqual({
      color: toneColors('light', 'ok').fg,
    });
  });

  it('opens its item, with a chevron, only when pressable', async () => {
    const onPress = vi.fn();
    const root = await render(<StatusRow title="Pedro López" onPress={onPress} />);
    expect(chevrons(root)).toHaveLength(1);
    const row = links(root)[0];
    act(() => row?.props.onPress());
    expect(onPress).toHaveBeenCalledOnce();

    const still = await render(<StatusRow title="Pedro López" />);
    expect(links(still)).toHaveLength(0);
    expect(chevrons(still)).toHaveLength(0);
  });
});
