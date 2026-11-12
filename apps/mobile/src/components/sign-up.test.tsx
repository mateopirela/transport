import {
  authCopy,
  legalCopy,
  mobileAuthCopy,
  mobileCompanyCopy,
  mobileErrorCopy,
  mobileKitCopy,
  palette,
  type Theme,
} from '@transport/shared';
import { act, type ReactElement } from 'react';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { setSavedForTest } from '../../test/stubs/secure-store';
import SignIn from '../app/(auth)/sign-in';
import SignUp from '../app/(auth)/sign-up';
import { ThemeProvider } from '../theme';

/*
 * The sign-up in steps of the app (D42, R2): step 1 (the kind and the
 * account) and step 2 (the fiscal data, the address and the terms) in one
 * screen, "Regresar" without losing anything, a persona física without a
 * legal representative, the passwords that can be shown, each error on its
 * field, and the way in with an invitation (D43).
 */

const signUpCarrier = vi.fn();
const push = vi.fn();

vi.mock('expo-router', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock('../providers/session', () => ({
  useSession: () => ({ actions: { signUpCarrier, signIn: vi.fn() } }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// react-test-renderer warns that it is deprecated on every render; nothing else is silenced.
const consoleError = console.error;
beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes('react-test-renderer is deprecated')) return;
    consoleError(...args);
  });
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => setTimeout(callback, 0));
  vi.stubGlobal('cancelAnimationFrame', (id: ReturnType<typeof setTimeout>) => clearTimeout(id));
});
afterAll(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

let renderer: ReactTestRenderer | undefined;

async function render(element: ReactElement): Promise<ReactTestInstance> {
  const made = await act(async () => create(<ThemeProvider>{element}</ThemeProvider>));
  renderer = made;
  return made.root;
}

beforeEach(() => {
  signUpCarrier.mockReset();
  push.mockReset();
});

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

/** The input labelled `label` (its accessibility label is the field's label). */
const input = (root: ReactTestInstance, label: string) =>
  root.find((n) => String(n.type) === 'TextInput' && n.props.accessibilityLabel === label);
/** Whether `node` is inside a View hidden with `display: none`. */
function hidden(node: ReactTestInstance): boolean {
  for (let at: ReactTestInstance | null = node; at; at = at.parent) {
    if (String(at.type) === 'View' && styleOf(at).display === 'none') return true;
  }
  return false;
}
const bar = (root: ReactTestInstance) =>
  root.find((n) => typeof n.type === 'string' && n.props.testID === 'bottom-bar');
const button = (root: ReactTestInstance, label: string) =>
  byRole(root, 'button').find((n) => texts(n).includes(label)) as ReactTestInstance;

async function type(root: ReactTestInstance, label: string, text: string) {
  await act(async () => input(root, label).props.onChangeText(text));
}
async function press(node: ReactTestInstance) {
  await act(async () => node.props.onPress());
  // The scroll to a field waits for the next frame.
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
}

async function fillStep1(root: ReactTestInstance) {
  await type(root, mobileAuthCopy.fullNameLabel, 'José Sánchez');
  await type(root, mobileAuthCopy.phoneLabel, '81 1234 5678');
  await type(root, mobileAuthCopy.emailLabel, 'jose@camion.mx');
  await type(root, mobileAuthCopy.passwordLabel, 'camion2026');
  await type(root, mobileAuthCopy.passwordConfirmLabel, 'camion2026');
}

async function fillStep2(root: ReactTestInstance) {
  // "Razón social" for a persona moral, "Nombre fiscal" for a física (D42).
  const legalName = byType(root, 'TextInput').some(
    (n) => n.props.accessibilityLabel === authCopy.fields.fiscalName,
  )
    ? authCopy.fields.fiscalName
    : authCopy.fields.legalName;
  await type(root, legalName, 'José Sánchez Méndez');
  await type(root, mobileCompanyCopy.rfcLabel, 'SAMJ800101AB1');
  await type(root, mobileCompanyCopy.streetLabel, 'Av. Constitución');
  await type(root, mobileCompanyCopy.exteriorNumberLabel, '100');
  await type(root, mobileCompanyCopy.neighborhoodLabel, 'Centro');
  await type(root, mobileCompanyCopy.postalCodeLabel, '64000');
  await type(root, mobileCompanyCopy.municipalityLabel, 'Monterrey');
}

async function pickOwnerOperator(root: ReactTestInstance) {
  const radio = byRole(root, 'radio').find((n) =>
    texts(n).includes(mobileAuthCopy.signUpKindOwnerOperator),
  ) as ReactTestInstance;
  await press(radio);
}

describe.each<Theme>(['light', 'dark'])('sign-up step 1 (%s)', (theme) => {
  it('shows the five steps on the first, with "Siguiente" the one primary', async () => {
    setSavedForTest(theme);
    const root = await render(<SignUp />);
    const progress = byRole(root, 'progressbar')[0] as ReactTestInstance;
    expect(progress.props.accessibilityValue).toMatchObject({ max: 5, now: 0 });
    expect(texts(root)).toEqual(
      expect.arrayContaining([mobileKitCopy.stepOf(1, 5), mobileAuthCopy.signUpSteps.account]),
    );
    expect(progress.props.accessibilityValue.text).toBe(
      `${mobileKitCopy.stepOf(1, 5)}: ${mobileAuthCopy.signUpSteps.account}`,
    );
    const filled = byRole(root, 'button').filter(
      (n) => styleOf(n).backgroundColor === palette[theme].accent,
    );
    expect(filled).toHaveLength(1);
    expect(texts(filled[0] as ReactTestInstance)).toEqual([mobileAuthCopy.signUpNext]);
    expect(texts(bar(root))).toEqual([mobileAuthCopy.signUpNext]);
  });
});

describe('sign-up step 1', () => {
  it('reads the kinds of D42 and who runs the company', async () => {
    const root = await render(<SignUp />);
    expect(texts(root)).toEqual(
      expect.arrayContaining([
        'Soy transportista (Gerente)',
        'Soy hombre-camión',
        'Posteriormente podrás invitar y administrar a los colaboradores de tu empresa.',
      ]),
    );
    expect(texts(root)).not.toContain(authCopy.registrationKinds.shipper);
  });

  it('offers the invitation under the kinds (D43)', async () => {
    const root = await render(<SignUp />);
    const all = texts(root);
    expect(all.indexOf(mobileAuthCopy.invitationQuestion)).toBeGreaterThan(
      all.indexOf(mobileAuthCopy.signUpKindOwnerOperator),
    );
    await press(button(root, mobileAuthCopy.invitationLink));
    expect(push).toHaveBeenCalledWith('/invitacion');
  });

  it('keeps the autofill hints so the phone offers to save the password', async () => {
    const root = await render(<SignUp />);
    expect(input(root, mobileAuthCopy.emailLabel).props).toMatchObject({
      textContentType: 'username',
      autoComplete: 'username',
    });
    for (const label of [mobileAuthCopy.passwordLabel, mobileAuthCopy.passwordConfirmLabel]) {
      expect(input(root, label).props).toMatchObject({
        textContentType: 'newPassword',
        autoComplete: 'new-password',
        secureTextEntry: true,
      });
    }
  });

  it('shows and hides each password with a toggle of its own name and state', async () => {
    const root = await render(<SignUp />);
    const shows = byRole(root, 'togglebutton').filter(
      (n) => n.props.accessibilityLabel === mobileKitCopy.showPassword,
    );
    expect(shows).toHaveLength(2);
    expect(shows.map((n) => n.props.accessibilityState)).toEqual([
      { checked: false },
      { checked: false },
    ]);
    await press(shows[0] as ReactTestInstance);
    expect(input(root, mobileAuthCopy.passwordLabel).props.secureTextEntry).toBe(false);
    expect(input(root, mobileAuthCopy.passwordConfirmLabel).props.secureTextEntry).toBe(true);
    const hide = byRole(root, 'togglebutton').find(
      (n) => n.props.accessibilityLabel === mobileKitCopy.hidePassword,
    ) as ReactTestInstance;
    expect(hide.props.accessibilityState).toEqual({ checked: true });
    await press(hide);
    expect(input(root, mobileAuthCopy.passwordLabel).props.secureTextEntry).toBe(true);
  });

  it('stays on step 1 with each error on its field', async () => {
    const root = await render(<SignUp />);
    await type(root, mobileAuthCopy.emailLabel, 'jose@camion');
    await press(button(bar(root), mobileAuthCopy.signUpNext));
    expect(texts(bar(root))).toEqual([mobileAuthCopy.signUpNext]);
    expect(byRole(root, 'alert').length).toBeGreaterThanOrEqual(3);
    expect(input(root, mobileAuthCopy.emailLabel).props.value).toBe('jose@camion');
  });
});

describe('sign-up step 2', () => {
  it('goes on with "Regresar" beside "Crear cuenta", step 1 kept out of sight', async () => {
    const root = await render(<SignUp />);
    await fillStep1(root);
    await press(button(bar(root), mobileAuthCopy.signUpNext));
    expect(texts(bar(root))).toEqual([mobileAuthCopy.signUpBack, mobileAuthCopy.signUpAction]);
    const progress = byRole(root, 'progressbar')[0] as ReactTestInstance;
    expect(progress.props.accessibilityValue).toMatchObject({ now: 1 });
    expect(texts(root)).toEqual(
      expect.arrayContaining([mobileKitCopy.stepOf(2, 5), mobileAuthCopy.signUpSteps.fiscal]),
    );
    // Mounted, so the password manager sees the account when it is created.
    expect(hidden(input(root, mobileAuthCopy.passwordLabel))).toBe(true);
    expect(hidden(input(root, mobileCompanyCopy.rfcLabel))).toBe(false);
  });

  it('goes back with everything as it was, the passwords too', async () => {
    const root = await render(<SignUp />);
    await fillStep1(root);
    await press(button(bar(root), mobileAuthCopy.signUpNext));
    await type(root, mobileCompanyCopy.rfcLabel, 'SAMJ800101AB1');
    await press(button(bar(root), mobileAuthCopy.signUpBack));
    expect(hidden(input(root, mobileAuthCopy.passwordLabel))).toBe(false);
    expect(input(root, mobileAuthCopy.emailLabel).props.value).toBe('jose@camion.mx');
    expect(input(root, mobileAuthCopy.passwordLabel).props.value).toBe('camion2026');
    await press(button(bar(root), mobileAuthCopy.signUpNext));
    expect(input(root, mobileCompanyCopy.rfcLabel).props.value).toBe('SAMJ800101AB1');
  });

  it('reads "Nombre fiscal" without a legal representative for a persona física', async () => {
    const root = await render(<SignUp />);
    await pickOwnerOperator(root);
    await fillStep1(root);
    await press(button(bar(root), mobileAuthCopy.signUpNext));
    const labels = byType(root, 'TextInput')
      .filter((n) => !hidden(n))
      .map((n) => n.props.accessibilityLabel as string);
    expect(labels).toContain(authCopy.fields.fiscalName);
    expect(labels).not.toContain(authCopy.fields.legalName);
    expect(labels).not.toContain(mobileCompanyCopy.legalRepresentativeLabel);
  });

  it('asks a persona moral for her razón social and legal representative', async () => {
    const root = await render(<SignUp />);
    await fillStep1(root);
    await press(button(bar(root), mobileAuthCopy.signUpNext));
    const labels = byType(root, 'TextInput').map((n) => n.props.accessibilityLabel as string);
    expect(labels).toContain(authCopy.fields.legalName);
    expect(labels).toContain(mobileCompanyCopy.legalRepresentativeLabel);
  });

  it('sends nothing without the state and the terms, each error on its own', async () => {
    const root = await render(<SignUp />);
    await fillStep1(root);
    await press(button(bar(root), mobileAuthCopy.signUpNext));
    await fillStep2(root);
    await press(button(bar(root), mobileAuthCopy.signUpAction));
    expect(signUpCarrier).not.toHaveBeenCalled();
    expect(texts(bar(root))).toEqual([mobileAuthCopy.signUpBack, mobileAuthCopy.signUpAction]);
    expect(texts(root)).toContain(legalCopy.acceptTerms.required);
    expect(input(root, mobileCompanyCopy.rfcLabel).props.value).toBe('SAMJ800101AB1');
  });

  it('sends the company of a persona física without a legal representative', async () => {
    signUpCarrier.mockResolvedValue({ ok: true, value: 'check_email' });
    const root = await render(<SignUp />);
    await fillStep1(root);
    await press(button(bar(root), mobileAuthCopy.signUpNext));
    await type(root, mobileCompanyCopy.legalRepresentativeLabel, 'Alguien más');
    const fisica = byRole(root, 'radio').find((n) =>
      texts(n).includes(mobileCompanyCopy.personTypeFisica),
    ) as ReactTestInstance;
    await press(fisica);
    await fillStep2(root);
    await pickState(root);
    await press(byRole(root, 'checkbox')[0] as ReactTestInstance);
    await press(button(bar(root), mobileAuthCopy.signUpAction));
    const sent = signUpCarrier.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sent).toMatchObject({ kind: 'carrier', personType: 'fisica', rfc: 'SAMJ800101AB1' });
    expect(sent.legalRepresentativeName).toBeUndefined();
    expect(texts(root)).toContain(mobileAuthCopy.checkEmailTitle);
  });

  it('brings a taken email back to step 1, on its field, the rest intact', async () => {
    signUpCarrier.mockResolvedValue({ ok: false, error: 'userAlreadyExists' });
    const root = await render(<SignUp />);
    await fillStep1(root);
    await press(button(bar(root), mobileAuthCopy.signUpNext));
    await fillStep2(root);
    await type(root, mobileCompanyCopy.rfcLabel, 'TRN010101AB1');
    await type(root, mobileCompanyCopy.legalRepresentativeLabel, 'José Sánchez');
    await pickState(root);
    await press(byRole(root, 'checkbox')[0] as ReactTestInstance);
    await press(button(bar(root), mobileAuthCopy.signUpAction));
    expect(signUpCarrier).toHaveBeenCalledTimes(1);
    const sent = signUpCarrier.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sent).toMatchObject({
      kind: 'carrier',
      email: 'jose@camion.mx',
      legalName: 'José Sánchez Méndez',
      acceptTerms: true,
    });
    expect(texts(bar(root))).toEqual([mobileAuthCopy.signUpNext]);
    expect(hidden(input(root, mobileAuthCopy.emailLabel))).toBe(false);
    expect(texts(root)).toContain(mobileErrorCopy.userAlreadyExists);
    expect(input(root, mobileAuthCopy.passwordLabel).props.value).toBe('camion2026');
    await press(button(bar(root), mobileAuthCopy.signUpNext));
    expect(input(root, mobileCompanyCopy.rfcLabel).props.value).toBe('TRN010101AB1');
  });
});

/** Picks "Nuevo León" in the state sheet. */
async function pickState(root: ReactTestInstance) {
  const option = root.find(
    (n) =>
      typeof n.type === 'string' &&
      n.props.accessibilityRole === 'radio' &&
      texts(n).includes('Nuevo León'),
  );
  await press(option);
}

describe('sign-in', () => {
  it('can show the password and offers the invitation under the fields (D42, D43)', async () => {
    const root = await render(<SignIn />);
    expect(input(root, mobileAuthCopy.passwordLabel).props.secureTextEntry).toBe(true);
    const show = byRole(root, 'togglebutton').find(
      (n) => n.props.accessibilityLabel === mobileKitCopy.showPassword,
    ) as ReactTestInstance;
    await press(show);
    expect(input(root, mobileAuthCopy.passwordLabel).props.secureTextEntry).toBe(false);
    const all = texts(root);
    expect(all.indexOf(mobileAuthCopy.invitationQuestion)).toBeLessThan(
      all.indexOf(mobileAuthCopy.goToSignUp),
    );
  });
});
