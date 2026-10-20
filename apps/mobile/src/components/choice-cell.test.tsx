import { act, type ReactElement } from 'react';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ChoiceCell, MultiChoiceCell } from './choice-cell';

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

const byRole = (root: ReactTestInstance, role: string) =>
  root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === role);

/** The pressable chip of `role` that reads `label`. */
function chip(root: ReactTestInstance, role: string, label: string): ReactTestInstance {
  const found = byRole(root, role).find((n) =>
    n.findAll((t) => String(t.type) === 'Text').some((t) => t.children.includes(label)),
  );
  if (!found) throw new Error(`No ${role} chip reads ${label}`);
  return found;
}

const OPTIONS = [
  { value: 'mty', label: 'Monterrey' },
  { value: 'gdl', label: 'Guadalajara' },
] as const;

describe('ChoiceCell', () => {
  it('is a radio group with one checked chip', async () => {
    const root = await render(
      <ChoiceCell label="Origen" options={OPTIONS} value="gdl" onChange={() => undefined} />,
    );
    expect(byRole(root, 'radiogroup')[0]?.props.accessibilityLabel).toBe('Origen');
    expect(chip(root, 'radio', 'Guadalajara').props.accessibilityState).toEqual({ checked: true });
    expect(chip(root, 'radio', 'Monterrey').props.accessibilityState).toEqual({ checked: false });
  });

  it('chooses another option and, when clearable, clears the chosen one', async () => {
    const onChange = vi.fn();
    const root = await render(
      <ChoiceCell label="Origen" options={OPTIONS} value="gdl" onChange={onChange} clearable />,
    );
    act(() => chip(root, 'radio', 'Monterrey').props.onPress());
    act(() => chip(root, 'radio', 'Guadalajara').props.onPress());
    expect(onChange.mock.calls).toEqual([['mty'], [undefined]]);
  });

  it('keeps the chosen option when it is not clearable', async () => {
    const onChange = vi.fn();
    const root = await render(
      <ChoiceCell label="Origen" options={OPTIONS} value="gdl" onChange={onChange} />,
    );
    act(() => chip(root, 'radio', 'Guadalajara').props.onPress());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows its error next to it', async () => {
    const root = await render(
      <ChoiceCell
        label="Origen"
        options={OPTIONS}
        value={undefined}
        onChange={() => undefined}
        error="Elige una ciudad."
      />,
    );
    expect(byRole(root, 'alert')).toHaveLength(1);
  });
});

describe('MultiChoiceCell', () => {
  it('toggles each option as a checkbox', async () => {
    const onToggle = vi.fn();
    const root = await render(
      <MultiChoiceCell label="Tipos" options={OPTIONS} values={['mty']} onToggle={onToggle} />,
    );
    expect(chip(root, 'checkbox', 'Monterrey').props.accessibilityState).toEqual({
      checked: true,
    });
    act(() => chip(root, 'checkbox', 'Guadalajara').props.onPress());
    expect(onToggle).toHaveBeenCalledWith('gdl');
  });
});
