import {
  formatMoney,
  mobileKitCopy,
  palette,
  PLATFORM_NAME,
  shape,
  stateToneColors,
  STATE_TONES,
  typeScale,
} from '@transport/shared';
import { act, type ReactElement } from 'react';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { setSavedForTest } from '../../test/stubs/secure-store';
import { ThemeProvider } from '../theme';
import { glyphOf } from './icons';
import { tabAccessibilityLabel } from './tab-bar';
import {
  BottomBar,
  BrandBlock,
  Button,
  ButtonRow,
  Cell,
  ChipTabs,
  Empty,
  Group,
  KpiGrid,
  KpiTile,
  Money,
  Notice,
  Pill,
  Segmented,
  Steps,
} from './ui';

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
    const root = await render(
      <Cell title="CS53-01" pill={{ label: 'Disponible', tone: 'done' }} />,
    );
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
    for (const variant of ['secondary', 'plain', 'destructive'] as const) {
      const root = await render(
        <Button label="Cancelar" variant={variant} onPress={() => undefined} />,
      );
      expect(styleOf(at(byRole(root, 'button'))).backgroundColor).not.toBe(light.accent);
    }
  });

  it('is 56 high when it is the step to take, with a radius of 8', async () => {
    const root = await render(
      <Button label="Llegué a la entrega" size="large" onPress={() => undefined} />,
    );
    const large = at(byRole(root, 'button'));
    expect(styleOf(large).minHeight).toBe(shape.buttonHeightPrimary);
    expect(styleOf(large).borderRadius).toBe(shape.button);
    expect(shape.buttonHeightPrimary).toBe(56);
    expect(shape.button).toBe(8);
  });

  it('outlines a destructive button in red, without filling it', async () => {
    const root = await render(
      <Button label="Archivar" variant="destructive" onPress={() => undefined} />,
    );
    const button = at(byRole(root, 'button'));
    expect(styleOf(button).borderColor).toBe(palette.light.redText);
    expect(styleOf(button).backgroundColor).toBe('transparent');
    expect(styleOf(at(byType(root, 'Text'))).color).toBe(palette.light.redText);
  });

  it('writes a plain button as text in the accent', async () => {
    const root = await render(
      <Button label="Crear cuenta" variant="plain" onPress={() => undefined} />,
    );
    const label = at(byType(root, 'Text'));
    expect(styleOf(label).color).toBe(palette.light.accentText);
  });

  it('is a 44-point touch target when small, without drawing it bigger', async () => {
    const small = at(
      byRole(await render(<Button label="Ver" size="small" onPress={() => undefined} />), 'button'),
    );
    expect(styleOf(small).minHeight).toBe(shape.buttonHeightSmall);
    const slop = small.props.hitSlop as { top: number; bottom: number };
    expect(shape.buttonHeightSmall + slop.top + slop.bottom).toBe(shape.minTouch);
    const regular = at(
      byRole(await render(<Button label="Entrar" onPress={() => undefined} />), 'button'),
    );
    expect(regular.props.hitSlop).toBeUndefined();
  });
});

describe('Pill', () => {
  const ground = (root: ReactTestInstance) => styleOf(at(byType(root, 'View'))).backgroundColor;
  const ink = (root: ReactTestInstance) => styleOf(at(byType(root, 'Text'))).color;
  const checks = (root: ReactTestInstance) =>
    byType(root, 'Ionicons').filter((n) => n.props.name === glyphOf('check'));

  it.each(STATE_TONES)(
    'paints "%s" with the fill and the ink of the tone map (light)',
    async (tone) => {
      const root = await render(<Pill label="Estado" tone={tone} />);
      const colors = stateToneColors('light', tone);
      expect(ground(root)).toBe(colors.fill);
      expect(ink(root)).toBe(colors.ink);
      expect(texts(root)).toEqual(['Estado']);
    },
  );

  it('keeps its wording as its accessible name, though it is drawn in capitals', async () => {
    const root = await render(<Pill label="Publicada por Transport" tone="attention" />);
    const text = at(byType(root, 'Text'));
    expect(styleOf(text).textTransform).toBe('uppercase');
    expect(text.props.accessibilityLabel).toBe('Publicada por Transport');
  });

  it('marks what is done with a check on the quiet fill, never with green', async () => {
    const root = await render(<Pill label="Entregado" tone="done" />);
    expect(ground(root)).toBe(palette.light.surfaceHigh);
    expect(ink(root)).toBe(palette.light.text);
    expect(checks(root)).toHaveLength(1);
    for (const tone of STATE_TONES.filter((t) => t !== 'done')) {
      expect(checks(await render(<Pill label="Estado" tone={tone} />))).toHaveLength(0);
    }
  });

  it('outlines the inactive tone, whose fill is the page', async () => {
    const root = await render(<Pill label="Borrador" tone="inactive" />);
    const pill = styleOf(at(byType(root, 'View')));
    expect(pill.backgroundColor).toBe(palette.light.bg);
    expect(pill.borderColor).toBe(palette.light.control);
    expect(pill.borderWidth).toBe(1);
    const filled = await render(<Pill label="Vencido" tone="problem" />);
    expect(styleOf(at(byType(filled, 'View')))).not.toHaveProperty('borderColor');
  });

  it('is the inactive pill without a tone', async () => {
    const root = await render(<Pill label="Cerrado" />);
    expect(ground(root)).toBe(stateToneColors('light', 'inactive').fill);
    expect(ink(root)).toBe(palette.light.textDim);
  });

  it('follows the dark theme', async () => {
    setSavedForTest('dark');
    const root = await render(
      <ThemeProvider>
        <Pill label="Vencido" tone="problem" />
      </ThemeProvider>,
    );
    expect(ground(root)).toBe(stateToneColors('dark', 'problem').fill);
    expect(ink(root)).toBe(stateToneColors('dark', 'problem').ink);
  });
});

describe('Notice', () => {
  const mark = (root: ReactTestInstance) => styleOf(at(byType(root, 'View'), 1)).backgroundColor;
  const icon = (root: ReactTestInstance) => at(byType(root, 'Ionicons')).props.name;

  it('wears the tone of what it says, with an icon beside the colour', async () => {
    const marks = [
      ['attention', 'attention', 'alert'],
      ['info', 'progress', 'info'],
      ['warning', 'pending', 'warning'],
      ['danger', 'problem', 'alert'],
      ['done', 'done', 'check'],
    ] as const;
    for (const [tone, status, glyph] of marks) {
      const root = await render(
        <Notice tone={tone} title="Sube tu constancia">
          Vence en 3 días.
        </Notice>,
      );
      expect(mark(root)).toBe(stateToneColors('light', status).fill);
      expect(icon(root)).toBe(glyphOf(glyph));
      expect(texts(root)).toEqual(['Sube tu constancia', 'Vence en 3 días.']);
      expect(styleOf(at(byType(root, 'View'))).backgroundColor).toBe(palette.light.cell);
    }
  });

  it('is read out as an alert only when something failed', async () => {
    const failed = await render(<Notice tone="danger" title="Rechazado" />);
    expect(byRole(failed, 'alert')).toHaveLength(1);
    for (const tone of ['attention', 'info', 'warning', 'done'] as const) {
      expect(byRole(await render(<Notice tone={tone} title="Aviso" />), 'alert')).toHaveLength(0);
    }
  });
});

describe('BrandBlock', () => {
  it('is Night in both themes, with the Night ink on it', async () => {
    for (const theme of ['light', 'dark'] as const) {
      setSavedForTest(theme);
      const root = await render(
        <ThemeProvider>
          <BrandBlock label="Tu siguiente paso" title="Llegué a la entrega" body="Saltillo" />
        </ThemeProvider>,
      );
      const block = styleOf(at(byType(root, 'View')));
      expect(block.backgroundColor).toBe(
        theme === 'dark' ? palette.dark.brandSelected : palette.light.brandBg,
      );
      expect(block.borderRadius).toBe(shape.card);
      const title = at(byRole(root, 'header'));
      expect(styleOf(title).color).toBe(palette.dark.text);
      expect(texts(root)).toEqual(['Tu siguiente paso', 'Llegué a la entrega', 'Saltillo']);
    }
  });

  it('holds the one primary, 56 high, over two secondary ways', async () => {
    const root = await render(
      <BrandBlock label="Tu siguiente paso" title="Llegué a la entrega">
        <Button label="Llegué a la entrega" size="large" onPress={() => undefined} />
        <ButtonRow>
          <Button label="Cómo llegar" variant="secondary" onPress={() => undefined} />
          <Button label="Reportar incidencia" variant="secondary" onPress={() => undefined} />
        </ButtonRow>
      </BrandBlock>,
    );
    const buttons = byRole(root, 'button');
    expect(buttons).toHaveLength(3);
    const filled = buttons.filter((n) => styleOf(n).backgroundColor === palette.dark.accent);
    expect(filled).toHaveLength(1);
    expect(styleOf(at(filled)).minHeight).toBe(shape.buttonHeightPrimary);
    // The secondary ones read the Night ink, whatever the theme of the app.
    expect(styleOf(at(byType(at(buttons, 1), 'Text'))).color).toBe(palette.dark.text);
  });

  it('shows the brand by its name on the way in', async () => {
    const root = await render(<BrandBlock mark title="Tu siguiente viaje" />);
    expect(texts(root)).toEqual([PLATFORM_NAME, 'Tu siguiente viaje']);
  });
});

describe('ButtonRow', () => {
  it('gives each button the same share of the row', async () => {
    const root = await render(
      <ButtonRow>
        <Button label="Cómo llegar" variant="secondary" onPress={() => undefined} />
        <Button label="Reportar incidencia" variant="secondary" onPress={() => undefined} />
      </ButtonRow>,
    );
    const row = at(byType(root, 'View'));
    expect(styleOf(row).flexDirection).toBe('row');
    const cells = row.children.filter((n): n is ReactTestInstance => typeof n !== 'string');
    expect(cells.map((n) => styleOf(n).flex)).toEqual([1, 1]);
  });
});

describe('Steps', () => {
  const steps = [
    { label: 'Recolección', detail: '08:10' },
    { label: 'En ruta' },
    { label: 'Entrega' },
    { label: 'Evidencia' },
  ];
  const bars = (root: ReactTestInstance) =>
    at(byRole(root, 'progressbar'))
      .children.filter((n): n is ReactTestInstance => typeof n !== 'string')
      .map((n) => styleOf(n).backgroundColor);

  it('fills the steps done, marks the one in course and says which it is', async () => {
    const root = await render(<Steps title="Avance del viaje" steps={steps} current={1} />);
    const light = palette.light;
    expect(bars(root)).toEqual([light.text, light.accent, light.separator, light.separator]);
    const bar = at(byRole(root, 'progressbar'));
    expect(bar.props.accessibilityLabel).toBe('Avance del viaje');
    expect(bar.props.accessibilityValue).toEqual({
      min: 0,
      max: 4,
      now: 1,
      text: `${mobileKitCopy.stepOf(2, 4)}: En ruta`,
    });
    expect(texts(root)).toEqual([
      'Avance del viaje',
      mobileKitCopy.stepOf(2, 4),
      'Recolección',
      '08:10',
      'En ruta',
      'Entrega',
      'Evidencia',
    ]);
  });

  it('never writes the step in course in the accent on Paper', async () => {
    const root = await render(<Steps steps={steps} current={1} />);
    const current = byType(root, 'Text').find((n) => n.children.includes('En ruta'));
    expect(styleOf(current as ReactTestInstance).color).toBe(palette.light.accentText);
  });

  it('has every step done past the last one, and none before the first', async () => {
    const done = await render(<Steps steps={steps} current={4} />);
    expect(bars(done)).toEqual(Array(4).fill(palette.light.text));
    expect(at(byRole(done, 'progressbar')).props.accessibilityValue.now).toBe(4);
    const waiting = await render(<Steps steps={steps} current={-1} />);
    expect(bars(waiting)).toEqual(Array(4).fill(palette.light.separator));
    expect(at(byRole(waiting, 'progressbar')).props.accessibilityValue.now).toBe(0);
  });
});

describe('Money', () => {
  it('writes whole pesos without cents, as the shared formatter does', async () => {
    const root = await render(<Money cents={1845000} />);
    expect(texts(root)).toEqual([formatMoney(1845000)]);
    expect(String(texts(root)[0])).not.toMatch(/\.00/u);
    const withCents = await render(<Money cents={18450050} />);
    expect(texts(withCents)).toEqual([formatMoney(18450050)]);
  });

  it('is the figure of the screen by default, each digit as wide as the others', async () => {
    const figure = at(byType(await render(<Money cents={1845000} />), 'Text'));
    expect(styleOf(figure).fontSize).toBe(typeScale.numeral.size);
    expect(styleOf(figure).fontVariant).toEqual(['tabular-nums']);
    expect(figure.props.numberOfLines).toBe(1);
    const row = at(byType(await render(<Money cents={1845000} size="body" />), 'Text'));
    expect(styleOf(row).fontSize).toBe(typeScale.body.size);
  });

  it('goes under its short label', async () => {
    const root = await render(<Money cents={1845000} label="Por cobrar" />);
    expect(texts(root)).toEqual(['Por cobrar', formatMoney(1845000)]);
    expect(styleOf(at(byType(root, 'Text'))).textTransform).toBe('uppercase');
  });
});

describe('KpiTile', () => {
  it('is a label, its figure and a line, and no button when it opens nothing', async () => {
    const root = await render(<KpiTile label="Viajes activos" value="4" hint="2 en ruta" />);
    expect(texts(root)).toEqual(['Viajes activos', '4', '2 en ruta']);
    expect(byRole(root, 'button')).toHaveLength(0);
  });

  it('opens where the figure comes from, read whole', async () => {
    const onPress = vi.fn();
    const root = await render(
      <KpiTile label="Viajes activos" value="4" hint="2 en ruta" onPress={onPress} />,
    );
    const tile = at(byRole(root, 'button'));
    expect(tile.props.accessibilityLabel).toBe('Viajes activos: 4. 2 en ruta');
    act(() => tile.props.onPress());
    expect(onPress).toHaveBeenCalledOnce();
    expect(styleOf(tile).backgroundColor).not.toBe(palette.light.accent);
  });
});

describe('KpiGrid', () => {
  it('lays the tiles in rows of two, keeping the place of a missing one', async () => {
    const root = await render(
      <KpiGrid>
        <KpiTile label="Viajes" value="4" />
        <KpiTile label="Ofertas" value="2" />
        <KpiTile label="Unidades" value="7" />
      </KpiGrid>,
    );
    const grid = at(byType(root, 'View'));
    const rows = byType(grid, 'View').filter((n) => styleOf(n).flexDirection === 'row');
    expect(rows).toHaveLength(2);
    // Each row has two places as wide as each other, the last one empty.
    for (const row of rows) {
      const places = row.children.filter((n): n is ReactTestInstance => typeof n !== 'string');
      expect(places.map((n) => styleOf(n).flex)).toEqual([1, 1]);
    }
    expect(texts(root)).toEqual(['Viajes', '4', 'Ofertas', '2', 'Unidades', '7']);
  });
});

describe('BottomBar', () => {
  it('holds the one primary on the cell colour, 56 high when it is the step', async () => {
    const root = await render(
      <BottomBar
        action={{ label: 'Ofertar', onPress: () => undefined, size: 'large' }}
        figure={{ label: 'Flete', value: '$18,450' }}
      />,
    );
    const bar = root.find((n) => typeof n.type === 'string' && n.props.testID === 'bottom-bar');
    expect(styleOf(bar).backgroundColor).toBe(palette.light.cell);
    const buttons = byRole(root, 'button');
    expect(buttons).toHaveLength(1);
    expect(styleOf(at(buttons)).backgroundColor).toBe(palette.light.accent);
    expect(styleOf(at(buttons)).minHeight).toBe(shape.buttonHeightPrimary);
    expect(texts(root)).toEqual(['Flete', '$18,450', 'Ofertar']);
  });

  it('fills only its action when there is a secondary one beside it', async () => {
    const root = await render(
      <BottomBar
        action={{ label: 'Guardar', onPress: () => undefined }}
        secondary={{ label: 'Cancelar', onPress: () => undefined }}
      />,
    );
    const filled = byRole(root, 'button').filter(
      (n) => styleOf(n).backgroundColor === palette.light.accent,
    );
    expect(filled).toHaveLength(1);
    expect(byType(at(filled), 'Text').flatMap((n) => n.children)).toEqual(['Guardar']);
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

  it('gives each segment a 44-point touch area inside its frame, without growing', async () => {
    const root = await render(
      <Segmented label="Apariencia" value="light" options={options} onChange={() => undefined} />,
    );
    const frame = styleOf(at(byRole(root, 'radiogroup')));
    for (const radio of byRole(root, 'radio')) {
      const slop = radio.props.hitSlop as { top: number; bottom: number };
      const height = styleOf(radio).minHeight as number;
      expect(height + slop.top + slop.bottom).toBe(shape.minTouch);
      // The frame holds the whole touch area (Android clips a slop at the parent).
      expect(frame.paddingVertical).toBeGreaterThanOrEqual(slop.top);
    }
    // On screen it takes the height of a small button, as before.
    const outer =
      (styleOf(at(byRole(root, 'radio'))).minHeight as number) +
      2 * (frame.paddingVertical as number) +
      2 * (frame.marginVertical as number);
    expect(outer).toBe(shape.buttonHeightSmall);
  });
});

describe('ChipTabs', () => {
  it("leaves room in the scroller for the chips' 44-point touch areas", async () => {
    const root = await render(
      <ChipTabs
        label="Estado"
        value="all"
        options={[
          { value: 'all', label: 'Todas' },
          { value: 'open', label: 'Abiertas', count: 3 },
        ]}
        onChange={() => undefined}
      />,
    );
    const scroller = at(byType(root, 'ScrollView'));
    const content = [scroller.props.contentContainerStyle]
      .flat(Infinity)
      .reduce<Record<string, unknown>>((all, s) => (s ? { ...all, ...s } : all), {});
    for (const chip of byRole(root, 'radio')) {
      const slop = chip.props.hitSlop as { top: number; bottom: number };
      expect((styleOf(chip).minHeight as number) + slop.top + slop.bottom).toBe(shape.minTouch);
      expect(content.paddingVertical).toBeGreaterThanOrEqual(slop.top);
    }
    expect(styleOf(scroller).marginVertical).toBe(-(content.paddingVertical as number));
  });
});

describe('tab labels', () => {
  it('keep the label of React Navigation, which the Maestro flows tap', () => {
    expect(tabAccessibilityLabel('Viajes', 3, 6)).toBe('Viajes, tab, 4 of 6');
  });
});
