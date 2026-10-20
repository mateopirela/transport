import { act } from 'react';
import { Keyboard } from 'react-native';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { KeyboardBottomBar } from './keyboard-bar';

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
});

type Listener = (event: { endCoordinates: { height: number } }) => void;

describe('KeyboardBottomBar', () => {
  it('rises above the keyboard while it is open and goes back when it closes', async () => {
    const listeners = new Map<string, Listener>();
    const removed: string[] = [];
    vi.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, listener: Listener) => {
      listeners.set(name, listener);
      return { remove: () => removed.push(name) };
    }) as never);

    const made = await act(async () =>
      create(<KeyboardBottomBar action={{ label: 'Enviar oferta', onPress: () => undefined }} />),
    );
    renderer = made;
    const anchor = () =>
      made.root.find((n) => String(n.type) === 'View' && n.props.pointerEvents === 'box-none');
    const bottom = () => ([anchor().props.style].flat(Infinity) as { bottom?: number }[]).at(-1);

    expect(bottom()).toEqual({ bottom: 0 });
    act(() => listeners.get('keyboardWillShow')?.({ endCoordinates: { height: 336 } }));
    // The keyboard past the stand-in phone's bottom inset (34): the bar keeps its own padding.
    expect(bottom()).toEqual({ bottom: 336 - 34 });
    act(() => listeners.get('keyboardWillHide')?.({ endCoordinates: { height: 0 } }));
    expect(bottom()).toEqual({ bottom: 0 });

    act(() => renderer?.unmount());
    renderer = undefined;
    expect(removed.sort()).toEqual(['keyboardWillHide', 'keyboardWillShow']);
  });
});
