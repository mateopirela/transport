import { mobileErrorCopy } from '@transport/shared';
import { act, createRef } from 'react';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { resetSheetCalls, sheetCalls } from '../../test/stubs/bottom-sheet';
import { ConfirmSheet, type ConfirmSheetHandle, type Confirmation } from './sheet';

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
  resetSheetCalls();
});

/** Whether a node is the host element `name` (test/stubs/react-native.tsx). */
const is = (node: ReactTestInstance, name: string) => node.type === name;

const texts = (root: ReactTestInstance) =>
  root
    .findAll((n) => is(n, 'Text'))
    .flatMap((n) => n.children.filter((c) => typeof c === 'string'));

function confirmButton(root: ReactTestInstance, label: string): ReactTestInstance {
  const button = root.find(
    (n) =>
      is(n, 'Pressable') &&
      n.findAll((t) => is(t, 'Text') && t.children.includes(label)).length > 0,
  );
  return button;
}

async function ask(confirmation: Confirmation) {
  const ref = createRef<ConfirmSheetHandle>();
  const made = await act(async () => create(<ConfirmSheet ref={ref} />));
  renderer = made;
  act(() => ref.current?.ask(confirmation));
  return made.root;
}

const base = {
  title: '¿Dar de baja la unidad?',
  body: 'Dejará de aparecer en tu flota.',
  confirmLabel: 'Dar de baja la unidad',
  cancelLabel: 'Cancelar',
  destructive: true,
};

describe('ConfirmSheet', () => {
  it('runs the step and closes once it went through', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const root = await ask({ ...base, onConfirm });
    expect(sheetCalls.present).toBe(1);
    await act(async () => confirmButton(root, base.confirmLabel).props.onPress());
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(sheetCalls.dismiss).toBe(1);
  });

  it('stays open with an error when the step fails, and lets the person retry', async () => {
    const onConfirm = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(undefined);
    const root = await ask({ ...base, onConfirm });

    await act(async () => confirmButton(root, base.confirmLabel).props.onPress());
    expect(sheetCalls.dismiss).toBe(0);
    expect(texts(root)).toContain(mobileErrorCopy.unknown);
    expect(confirmButton(root, base.confirmLabel).props.disabled).toBe(false);

    await act(async () => confirmButton(root, base.confirmLabel).props.onPress());
    expect(onConfirm).toHaveBeenCalledTimes(2);
    expect(sheetCalls.dismiss).toBe(1);
    expect(texts(root)).not.toContain(mobileErrorCopy.unknown);
  });

  it('says the step’s own error message when it has one', async () => {
    const root = await ask({
      ...base,
      errorMessage: 'No pudimos dar de baja la unidad.',
      onConfirm: () => {
        throw new Error('rpc');
      },
    });
    await act(async () => confirmButton(root, base.confirmLabel).props.onPress());
    expect(texts(root)).toContain('No pudimos dar de baja la unidad.');
    expect(sheetCalls.dismiss).toBe(0);
  });
});
