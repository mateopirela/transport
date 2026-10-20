import { palette, toneColors } from '@transport/shared';
import { act, type ReactElement } from 'react';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { setSavedForTest } from '../../test/stubs/secure-store';
import { ThemeProvider } from '../theme';
import { glyphOf } from './icons';
import { tabAccessibilityLabel } from './tab-bar';
import { Badge, Button, Cell, Empty, Group, Pill, Segmented } from './ui';

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
  setSavedForTest(null);
});

/** The `index`-th of some nodes, which must be there. */
function at(nodes: ReactTestInstance[], index = 0): ReactTestInstance {
  const node = nodes[index];
  if (!node) throw new Error(`Expected at least ${index + 1} nodes, found ${nodes.length}`);
  return node;
}

const byType = (root: ReactTestInstance, type: string) => root.findAll((n) => n.type === type);
const byRole = (root: ReactTestInstance, role: string) =>
  root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === role);
const texts = (root: ReactTestInstance) =>
  byType(root, 'Text').flatMap((n) => n.children.filter((c) => typeof c === 'string'));
const chevrons = (root: ReactTestInstance) =>
  byType(root, 'Ionicons').filter((n) => n.props.name === glyphOf('chevronRight'));
/** The flattened style of a host element. */
const styleOf = (node: ReactTestInstance): Record<string, unknown> =>
  [node.props.style]
    .flat(Infinity)
    .reduce<Record<string, unknown>>((all, s) => (s ? { ...all, ...s } : all), {});

describe('Cell', () => {
  it('has no chevron when it does not open anything', async () => {
    const root = await render(<Cell title="TRN-01" subtitle="Tractocamión" />);
    expect(chevrons(root)).toHaveLength(0);
    expect(byRole(root, 'button')).toHaveLength(0);
    expect(texts(root)).toEqual(['TRN-01', 'Tractocamión']);
  });

  it('shows a chevron on a row that opens another screen', async () => {
    const onPress = vi.fn();
    const root = await render(<Cell title="Documentos" role="link" onPress={onPress} />);
    expect(chevrons(root)).toHaveLength(1);
    const row = at(byRole(root, 'link'));
    act(() => row.props.onPress());
    expect(onPress).toHaveBeenCalledOnce();
  });

  it('has no chevron on a row that acts in place, or when told not to', async () => {
    expect(
      chevrons(await render(<Cell title="Reintentar" onPress={() => undefined} />)),
    ).toHaveLength(0);
    expect(
      chevrons(
        await render(<Cell title="Abrir" role="link" chevron={false} onPress={() => undefined} />),
      ),
    ).toHaveLength(0);
  });

  it('marks the chosen option of a list with a check', async () => {
    const root = await render(
      <Cell title="Claro" role="radio" checked onPress={() => undefined} />,
    );
    const row = at(byRole(root, 'radio'));
    expect(row.props.accessibilityState).toEqual({ checked: true, disabled: false });
    expect(byType(root, 'Ionicons').map((n) => n.props.name)).toEqual([glyphOf('check')]);
  });

  it('shows its pill', async () => {
    const root = await render(<Cell title="CS53-01" pill={{ label: 'Disponible', tone: 'ok' }} />);
    expect(texts(root)).toContain('Disponible');
  });
});

describe('Group', () => {
  it('keeps every row of a fragment, with keys apart from the rows around it', async () => {
    const duplicateKeys = vi.fn();
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      if (String(args[0]).includes('same key')) duplicateKeys();
    });
    try {
      const root = await render(
        <Group>
          <Cell title="Placas" />
          <>
            <Cell title="Tipo de caja" />
            <Cell title="Capacidad" />
          </>
          <Cell title="Equipamiento" />
        </Group>,
      );
      expect(texts(root)).toEqual(['Placas', 'Tipo de caja', 'Capacidad', 'Equipamiento']);
      expect(duplicateKeys).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('Button', () => {
  it('is one button, read with its label', async () => {
    const onPress = vi.fn();
    const root = await render(<Button label="Entrar" onPress={onPress} />);
    const buttons = byRole(root, 'button');
    expect(buttons).toHaveLength(1);
    expect(at(buttons).props.accessibilityState).toEqual({ disabled: false, busy: false });
    expect(texts(root)).toEqual(['Entrar']);
    act(() => at(buttons).props.onPress());
    expect(onPress).toHaveBeenCalledOnce();
  });

  it('is disabled and busy while loading, with a spinner', async () => {
    const root = await render(<Button label="Entrar" loading onPress={() => undefined} />);
    const button = at(byRole(root, 'button'));
    expect(button.props.disabled).toBe(true);
    expect(button.props.accessibilityState).toEqual({ disabled: true, busy: true });
    expect(byType(root, 'ActivityIndicator')).toHaveLength(1);
  });

  it('fills only the primary with the accent', async () => {
    const light = palette.light;
    const primary = at(
      byRole(await render(<Button label="Ofertar" onPress={() => undefined} />), 'button'),
    );
    expect(styleOf(primary).backgroundColor).toBe(light.accent);
    for (const variant of ['secondary', 'plain', 'destructive', 'link'] as const) {
      const root = await render(
        <Button label="Cancelar" variant={variant} onPress={() => undefined} />,
      );
      expect(styleOf(at(byRole(root, 'button'))).backgroundColor).not.toBe(light.accent);
    }
  });

  it('reads the old `link` variant as plain text in the accent', async () => {
    const root = await render(
      <Button label="Crear cuenta" variant="link" onPress={() => undefined} />,
    );
    const label = at(byType(root, 'Text'));
    expect(styleOf(label).color).toBe(palette.light.accentText);
  });
});

describe('Pill', () => {
  const ground = (root: ReactTestInstance) => styleOf(at(byType(root, 'View'))).backgroundColor;
  const ink = (root: ReactTestInstance) => styleOf(at(byType(root, 'Text'))).color;

  it('paints each tone on its own tint (light)', async () => {
    for (const tone of ['accent', 'ok', 'amber', 'red'] as const) {
      const root = await render(<Pill label="Estado" tone={tone} />);
      expect(ground(root)).toBe(toneColors('light', tone).bg);
      expect(ink(root)).toBe(toneColors('light', tone).fg);
    }
  });

  it('is quiet without a tone', async () => {
    const root = await render(<Pill label="Cerrado" />);
    expect(ground(root)).toBe(palette.light.surfaceHigh);
    expect(ink(root)).toBe(palette.light.textDim);
  });

  it('follows the dark theme', async () => {
    setSavedForTest('dark');
    const root = await render(
      <ThemeProvider>
        <Pill label="Vencido" tone="red" />
      </ThemeProvider>,
    );
    expect(ground(root)).toBe(toneColors('dark', 'red').bg);
    expect(ink(root)).toBe(toneColors('dark', 'red').fg);
  });

  it('keeps the old Badge tones as aliases', async () => {
    const root = await render(<Badge label="Aprobado" tone="success" />);
    expect(ink(root)).toBe(toneColors('light', 'ok').fg);
  });
});

describe('Empty', () => {
  it('says what is missing, what happens next, and offers a way forward', async () => {
    const root = await render(
      <Empty
        title="Aún no hay unidades"
        body="Agrega tus tractocamiones."
        action={<Button label="Agregar unidad" variant="secondary" onPress={() => undefined} />}
      />,
    );
    expect(texts(root)).toEqual([
      'Aún no hay unidades',
      'Agrega tus tractocamiones.',
      'Agregar unidad',
    ]);
    expect(byRole(root, 'button')).toHaveLength(1);
  });

  it('may have no body and no action', async () => {
    const root = await render(<Empty title="Sin viajes" />);
    expect(texts(root)).toEqual(['Sin viajes']);
    expect(byRole(root, 'button')).toHaveLength(0);
  });
});

describe('Segmented', () => {
  const options = [
    { value: 'system', label: 'Sistema' },
    { value: 'light', label: 'Claro' },
    { value: 'dark', label: 'Oscuro' },
  ] as const;

  it('is a radio group with the selected option checked', async () => {
    const root = await render(
      <Segmented label="Apariencia" value="light" options={options} onChange={() => undefined} />,
    );
    const group = at(byRole(root, 'radiogroup'));
    expect(group.props.accessibilityLabel).toBe('Apariencia');
    expect(byRole(root, 'radio').map((n) => n.props.accessibilityState.checked)).toEqual([
      false,
      true,
      false,
    ]);
  });

  it('reports a new choice, and not the one already made', async () => {
    const onChange = vi.fn();
    const root = await render(
      <Segmented label="Apariencia" value="light" options={options} onChange={onChange} />,
    );
    const radios = byRole(root, 'radio');
    const system = at(radios, 0);
    const light = at(radios, 1);
    act(() => light.props.onPress());
    expect(onChange).not.toHaveBeenCalled();
    act(() => system.props.onPress());
    expect(onChange).toHaveBeenCalledExactlyOnceWith('system');
  });
});

describe('tab labels', () => {
  it('keep the label of React Navigation, which the Maestro flows tap', () => {
    expect(tabAccessibilityLabel('Viajes', 3, 6)).toBe('Viajes, tab, 4 of 6');
  });
});
