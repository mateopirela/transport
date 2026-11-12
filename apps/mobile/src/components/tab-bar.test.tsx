import { palette, type Theme } from '@transport/shared';
import { act, type ReactElement } from 'react';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { setSavedForTest } from '../../test/stubs/secure-store';
import { tabBar, ThemeProvider } from '../theme';
import { glyphOf } from './icons';
import { TabBar, type TabBarProps } from './tab-bar';
import { tabBarBottom } from './ui';

/*
 * The tab bar of "Fulmis" (docs/plan-fulmis.md §1.5): solid on the cell
 * colour under a fine line, the selected tab in the accent's text colour and
 * never a filled button, a counter on the accent, and the labels the Maestro
 * flows tap.
 */

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

/** The phone's bottom inset in the stubs (test/stubs/safe-area.tsx). */
const PHONE_BOTTOM = 34;

const byType = (root: ReactTestInstance, type: string) => root.findAll((n) => n.type === type);
const byRole = (root: ReactTestInstance, role: string) =>
  root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === role);
const texts = (root: ReactTestInstance) =>
  byType(root, 'Text').flatMap((n) => n.children.filter((c): c is string => typeof c === 'string'));
const styleOf = (node: ReactTestInstance): Record<string, unknown> =>
  [node.props.style]
    .flat(Infinity)
    .reduce<Record<string, unknown>>((all, s) => (s ? { ...all, ...s } : all), {});

function at(nodes: ReactTestInstance[], index = 0): ReactTestInstance {
  const node = nodes[index];
  if (!node) throw new Error(`Expected at least ${index + 1} nodes, found ${nodes.length}`);
  return node;
}

interface Route {
  name: string;
  title: string;
  badge?: number | string;
  hidden?: boolean;
}

const ROUTES: readonly Route[] = [
  { name: 'index', title: 'Inicio' },
  { name: 'loads', title: 'Cargas', badge: 3 },
  { name: 'trips', title: 'Viajes', badge: 0 },
  { name: 'detail', title: 'Detalle', hidden: true },
  { name: 'more', title: 'Más', badge: 120 },
];

const ICONS = { index: 'home', loads: 'loads', trips: 'trips', more: 'more' } as const;

/** The props React Navigation gives a tab bar, with only what ours reads. */
function props(index: number, routes: readonly Route[] = ROUTES) {
  const emit = vi.fn(() => ({ defaultPrevented: false }));
  const navigate = vi.fn();
  const value = {
    state: { index, routes: routes.map((route) => ({ key: route.name, name: route.name })) },
    descriptors: Object.fromEntries(
      routes.map((route) => [
        route.name,
        {
          options: {
            title: route.title,
            tabBarBadge: route.badge,
            tabBarItemStyle: route.hidden ? { display: 'none' } : undefined,
          },
        },
      ]),
    ),
    navigation: { emit, navigate },
  } as unknown as TabBarProps;
  return { value, emit, navigate };
}

describe.each<Theme>(['light', 'dark'])('TabBar (%s)', (theme) => {
  it('is solid on the cell colour, from edge to edge under a fine line', async () => {
    setSavedForTest(theme);
    const root = await render(
      <ThemeProvider>
        <TabBar {...props(0).value} icons={ICONS} />
      </ThemeProvider>,
    );
    const bar = styleOf(at(byRole(root, 'tablist')));
    expect(bar.backgroundColor).toBe(palette[theme].cell);
    expect(bar.borderTopColor).toBe(palette[theme].separator);
    expect([bar.left, bar.right, bar.bottom]).toEqual([0, 0, 0]);
    expect(bar).not.toHaveProperty('borderRadius');
    expect(Object.keys(bar).filter((key) => /shadow|elevation/iu.test(key))).toEqual([]);
  });

  it('marks the selected tab with the accent’s text colour, never with a fill', async () => {
    setSavedForTest(theme);
    const root = await render(
      <ThemeProvider>
        <TabBar {...props(1).value} icons={ICONS} />
      </ThemeProvider>,
    );
    const tabs = byRole(root, 'tab');
    expect(tabs.map((n) => n.props.accessibilityState.selected)).toEqual([
      false,
      true,
      false,
      false,
    ]);
    for (const tab of tabs) expect(styleOf(tab)).not.toHaveProperty('backgroundColor');
    const selected = at(tabs, 1);
    const label = at(byType(selected, 'Text'), 1);
    expect(styleOf(label).color).toBe(palette[theme].accentText);
    expect(at(byType(selected, 'Ionicons')).props.name).toBe(glyphOf('loads', true));
    const other = at(tabs, 0);
    expect(styleOf(at(byType(other, 'Text'))).color).toBe(palette[theme].textDim);
    expect(at(byType(other, 'Ionicons')).props.name).toBe(glyphOf('home'));
  });

  it('counts on the accent, with the ink that reads on it', async () => {
    setSavedForTest(theme);
    const root = await render(
      <ThemeProvider>
        <TabBar {...props(0).value} icons={ICONS} />
      </ThemeProvider>,
    );
    const counter = at(byType(at(byRole(root, 'tab'), 1), 'Text'));
    expect(counter.children).toEqual(['3']);
    expect(styleOf(counter).color).toBe(palette[theme].accentInk);
    const badge = at(byRole(root, 'tab'), 1).findAll(
      (n) => String(n.type) === 'View' && styleOf(n).backgroundColor === palette[theme].accent,
    );
    expect(badge).toHaveLength(1);
    expect(byType(at(badge), 'Text')).toEqual([counter]);
  });
});

describe('TabBar', () => {
  it('shows a counter only where there is something to count, up to 99+', async () => {
    const root = await render(<TabBar {...props(0).value} icons={ICONS} />);
    expect(texts(root)).toEqual(['Inicio', '3', 'Cargas', 'Viajes', '99+', 'Más']);
  });

  it('keeps the labels of React Navigation, counted over the hidden routes too', async () => {
    const root = await render(<TabBar {...props(0).value} icons={ICONS} />);
    expect(byRole(root, 'tab').map((n) => n.props.accessibilityLabel)).toEqual([
      'Inicio, tab, 1 of 5',
      'Cargas, tab, 2 of 5',
      'Viajes, tab, 3 of 5',
      'Más, tab, 5 of 5',
    ]);
  });

  it('is as high as the room the screens keep clear of it', async () => {
    const root = await render(<TabBar {...props(0).value} icons={ICONS} />);
    const bar = styleOf(at(byRole(root, 'tablist')));
    const tabs = styleOf(at(byType(at(byRole(root, 'tablist')), 'View'), 1));
    const height =
      (bar.paddingTop as number) + (tabs.height as number) + (bar.paddingBottom as number);
    expect(height).toBe(tabBar.height + tabBarBottom(PHONE_BOTTOM));
  });

  it('opens a tab that is not the one in front, and only tells the one that is', async () => {
    const { value, emit, navigate } = props(0);
    const root = await render(<TabBar {...value} icons={ICONS} />);
    act(() => at(byRole(root, 'tab'), 1).props.onPress());
    expect(emit).toHaveBeenCalledWith({
      type: 'tabPress',
      target: 'loads',
      canPreventDefault: true,
    });
    expect(navigate).toHaveBeenCalledWith('loads');
    navigate.mockClear();
    act(() => at(byRole(root, 'tab'), 0).props.onPress());
    expect(navigate).not.toHaveBeenCalled();
  });
});
