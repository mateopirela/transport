import { act, type ReactElement } from 'react';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { spacing, tabBar } from '../theme';
import { TabBottomBar } from './tab-bottom-bar';
import { TabScreens, tabBarBottom } from './ui';

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

/** The phone's bottom inset in the stubs (test/stubs/safe-area.tsx). */
const PHONE_BOTTOM = 34;

/** How far from the bottom edge the bar's glass starts its row of actions. */
function barPadding(root: ReactTestInstance): unknown {
  const bar = root.find((n) => (n.type as unknown) === 'BlurView');
  const style = [bar.props.style]
    .flat(Infinity)
    .reduce<Record<string, unknown>>((all, s) => (s ? { ...all, ...s } : all), {});
  return style.paddingBottom;
}

const action = { label: 'Salir a recolección', onPress: () => undefined };

describe('TabBottomBar', () => {
  it('is the plain bottom bar outside the tabs, over the phone’s inset', async () => {
    const root = await render(<TabBottomBar action={action} />);
    expect(barPadding(root)).toBe(PHONE_BOTTOM + spacing.sm);
  });

  it('rests its actions right above the floating tab bar inside the tabs', async () => {
    const root = await render(
      <TabScreens>
        <TabBottomBar action={action} />
      </TabScreens>,
    );
    expect(barPadding(root)).toBe(tabBar.height + tabBarBottom(PHONE_BOTTOM) + spacing.sm);
  });

  it('keeps one button, read with the step', async () => {
    const root = await render(
      <TabScreens>
        <TabBottomBar action={action} />
      </TabScreens>,
    );
    const buttons = root.findAll(
      (n) => typeof n.type === 'string' && n.props.accessibilityRole === 'button',
    );
    expect(buttons).toHaveLength(1);
  });
});
