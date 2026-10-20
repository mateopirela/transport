import { mobileAuthCopy, palette, type Theme } from '@transport/shared';
import { act, type ReactElement } from 'react';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { setSavedForTest } from '../../test/stubs/secure-store';
import SignIn from '../app/(auth)/sign-in';
import { ThemeProvider } from '../theme';
import { OptionGroup } from './option-group';

/*
 * The access screens of U3 (docs/plan-rediseno.md §2): the sign-in in both
 * themes, with one primary and the texts the Maestro flows look for, and
 * the choice of what is registered as rows with a check.
 */

vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('../providers/session', () => ({
  useSession: () => ({ actions: { signIn: vi.fn() } }),
}));

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

const byType = (root: ReactTestInstance, type: string) => root.findAll((n) => n.type === type);
const byRole = (root: ReactTestInstance, role: string) =>
  root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === role);
const texts = (root: ReactTestInstance) =>
  byType(root, 'Text').flatMap((n) => n.children.filter((c): c is string => typeof c === 'string'));
const styleOf = (node: ReactTestInstance): Record<string, unknown> =>
  [node.props.style]
    .flat(Infinity)
    .reduce<Record<string, unknown>>((all, s) => (s ? { ...all, ...s } : all), {});

describe.each<Theme>(['light', 'dark'])('sign-in (%s)', (theme) => {
  it('has one primary, "Entrar", on the page of the theme', async () => {
    setSavedForTest(theme);
    const root = await render(
      <ThemeProvider>
        <SignIn />
      </ThemeProvider>,
    );
    const filled = byRole(root, 'button').filter(
      (n) => styleOf(n).backgroundColor === palette[theme].accent,
    );
    expect(filled).toHaveLength(1);
    expect(texts(filled[0] as ReactTestInstance)).toEqual([mobileAuthCopy.signInAction]);
    const page = byType(root, 'ScrollView')[0] as ReactTestInstance;
    expect(styleOf(page).backgroundColor).toBe(palette[theme].bg);
  });

  it('keeps the texts the Maestro flows look for', async () => {
    setSavedForTest(theme);
    const root = await render(
      <ThemeProvider>
        <SignIn />
      </ThemeProvider>,
    );
    expect(texts(root)).toEqual(
      expect.arrayContaining([
        mobileAuthCopy.appName,
        mobileAuthCopy.tagline,
        mobileAuthCopy.identifierLabel,
        mobileAuthCopy.passwordLabel,
        mobileAuthCopy.signInAction,
        mobileAuthCopy.goToSignUp,
        mobileAuthCopy.goToInvite,
      ]),
    );
    const inputs = byType(root, 'TextInput');
    expect(inputs.map((n) => n.props.accessibilityLabel)).toEqual([
      mobileAuthCopy.identifierLabel,
      mobileAuthCopy.passwordLabel,
    ]);
  });
});

describe('OptionGroup', () => {
  const options = [
    { value: 'carrier', label: 'Transportista (empresa)' },
    { value: 'owner_operator', label: 'Hombre camión' },
  ] as const;

  it('is a radio group of rows, the chosen one checked', async () => {
    const onChange = vi.fn();
    const root = await render(
      <OptionGroup
        label="Tipo de registro"
        options={options}
        value="carrier"
        onChange={onChange}
        hint="Serás Gerente y Operador."
      />,
    );
    expect(byRole(root, 'radiogroup')).toHaveLength(1);
    const radios = byRole(root, 'radio');
    expect(radios.map((n) => n.props.accessibilityState.checked)).toEqual([true, false]);
    act(() => (radios[1] as ReactTestInstance).props.onPress());
    expect(onChange).toHaveBeenCalledWith('owner_operator');
    expect(texts(root)).toContain('Serás Gerente y Operador.');
  });

  it('shows the error in place of the hint', async () => {
    const root = await render(
      <OptionGroup
        label="Tipo de registro"
        options={options}
        value="carrier"
        onChange={() => undefined}
        hint="Serás Gerente y Operador."
        error="Elige una opción."
      />,
    );
    expect(texts(root)).toContain('Elige una opción.');
    expect(texts(root)).not.toContain('Serás Gerente y Operador.');
    expect(byRole(root, 'alert')).toHaveLength(1);
  });
});
