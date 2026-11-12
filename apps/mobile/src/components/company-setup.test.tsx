import { authCopy, mobileCompanyCopy, mobileErrorCopy } from '@transport/shared';
import { act, type ReactElement } from 'react';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import CompanySetup from '../app/company';
import { ThemeProvider } from '../theme';

/*
 * Step 2 after the email confirmation (D42, R2): the company saved at
 * sign-up is registered by itself; a refused one comes back as the form with
 * the error on its field; an account without one fills the form, with the
 * labels of its person type.
 */

const registerPendingCompany = vi.fn();
const refreshProfile = vi.fn(async () => undefined);
let metadata: Record<string, unknown> = {};

vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('../providers/session', () => ({
  useSession: () => ({
    session: { user: { email: 'jose@camion.mx', user_metadata: metadata } },
    profile: { fullName: 'José Sánchez', phone: '+528112345678' },
    actions: { registerPendingCompany, signOut: vi.fn() },
    refreshProfile,
  }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
  // Lets the registration of the saved company settle.
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  return made.root;
}

beforeEach(() => {
  registerPendingCompany.mockReset();
  refreshProfile.mockClear();
  metadata = {};
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
});

const texts = (root: ReactTestInstance) =>
  root
    .findAll((n) => String(n.type) === 'Text')
    .flatMap((n) => n.children.filter((c): c is string => typeof c === 'string'));
const labels = (root: ReactTestInstance) =>
  root
    .findAll((n) => String(n.type) === 'TextInput')
    .map((n) => n.props.accessibilityLabel as string);
const input = (root: ReactTestInstance, label: string) =>
  root.find((n) => String(n.type) === 'TextInput' && n.props.accessibilityLabel === label);

const SAVED = {
  kind: 'owner_operator',
  personType: 'fisica',
  legalName: 'José Sánchez Méndez',
  rfc: 'SAMJ800101AB1',
  fiscalStreet: 'Av. Constitución',
  fiscalExteriorNumber: '100',
  fiscalNeighborhood: 'Centro',
  fiscalPostalCode: '64000',
  fiscalMunicipality: 'Monterrey',
  fiscalState: 'Nuevo León',
  contactName: 'José Sánchez',
  contactEmail: 'jose@camion.mx',
  contactPhone: '+528112345678',
};

describe('company setup (D42, R2)', () => {
  it('registers the company saved at sign-up by itself, once', async () => {
    metadata = { pending_company: SAVED };
    registerPendingCompany.mockResolvedValue({ ok: true, value: undefined });
    const root = await render(<CompanySetup />);
    expect(registerPendingCompany).toHaveBeenCalledTimes(1);
    expect(registerPendingCompany.mock.calls[0]?.[0]).toMatchObject({
      kind: 'owner_operator',
      rfc: 'SAMJ800101AB1',
    });
    expect(refreshProfile).toHaveBeenCalledTimes(1);
    const loading = root.findAll(
      (n) =>
        typeof n.type === 'string' && n.props.accessibilityLabel === mobileCompanyCopy.registering,
    );
    expect(loading.length).toBeGreaterThan(0);
  });

  it('shows a refused one as the form, the error on its field, the data kept', async () => {
    metadata = { pending_company: SAVED };
    registerPendingCompany.mockResolvedValue({ ok: false, error: 'rfcTaken' });
    const root = await render(<CompanySetup />);
    expect(refreshProfile).not.toHaveBeenCalled();
    expect(texts(root)).toContain(mobileErrorCopy.rfcTaken);
    expect(input(root, mobileCompanyCopy.rfcLabel).props.value).toBe('SAMJ800101AB1');
    expect(input(root, authCopy.fields.fiscalName).props.value).toBe('José Sánchez Méndez');
    expect(labels(root)).not.toContain(mobileCompanyCopy.legalRepresentativeLabel);
  });

  it('ignores a saved company that is not a carrier one', async () => {
    metadata = { pending_company: { ...SAVED, kind: 'shipper' } };
    const root = await render(<CompanySetup />);
    expect(registerPendingCompany).not.toHaveBeenCalled();
    expect(labels(root)).toContain(authCopy.fields.legalName);
  });

  it('asks an account without one for its data, as a persona moral by default', async () => {
    const root = await render(<CompanySetup />);
    expect(registerPendingCompany).not.toHaveBeenCalled();
    expect(labels(root)).toEqual(
      expect.arrayContaining([
        authCopy.fields.legalName,
        mobileCompanyCopy.legalRepresentativeLabel,
      ]),
    );
    expect(input(root, mobileCompanyCopy.rfcLabel).props.value).toBe('');
  });
});
