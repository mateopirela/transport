/**
 * React Native for the kit's tests: each component is a host element named
 * after it, so react-test-renderer keeps its props (style, accessibility,
 * handlers) for the tests to read. Only what the kit uses.
 */
import { createElement, type ReactNode } from 'react';

type Props = Record<string, unknown> & { children?: ReactNode };
type PressableProps = Record<string, unknown> & {
  style?: unknown;
  children?: ReactNode | ((state: { pressed: boolean }) => ReactNode);
};

function host(name: string) {
  function Host(props: Props) {
    return createElement(name, props);
  }
  Host.displayName = name;
  return Host;
}

export const View = host('View');
export const Text = host('Text');
export const TextInput = host('TextInput');
export const ScrollView = host('ScrollView');
export const Switch = host('Switch');
export const ActivityIndicator = host('ActivityIndicator');
export const RefreshControl = host('RefreshControl');
export const KeyboardAvoidingView = host('KeyboardAvoidingView');

/** A pressable with its style and children resolved as when not pressed. */
export function Pressable({ style, children, ...props }: PressableProps) {
  const state = { pressed: false };
  return createElement(
    'Pressable',
    { ...props, style: typeof style === 'function' ? style(state) : style },
    typeof children === 'function' ? children(state) : children,
  );
}

type Style = Record<string, unknown> | null | undefined | false | Style[];

function flatten(style: Style): Record<string, unknown> | undefined {
  if (!style) return undefined;
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>((all, s) => ({ ...all, ...flatten(s) }), {});
  }
  return style;
}

export const StyleSheet = {
  create: <T,>(styles: T): T => styles,
  flatten,
  hairlineWidth: 0.5,
  absoluteFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
};

export const Platform = {
  OS: 'ios',
  select: <T,>(options: { ios?: T; default?: T }) => options.ios ?? options.default,
};

class AnimatedValue {
  constructor(public value: number) {}
}

const animation = { start: () => undefined, stop: () => undefined };

export const Animated = {
  View: host('Animated.View'),
  Value: AnimatedValue,
  loop: () => animation,
  sequence: () => animation,
  timing: () => animation,
};

export const Keyboard = {
  addListener: () => ({ remove: () => undefined }),
  dismiss: () => undefined,
};

export function useColorScheme(): 'light' | 'dark' | null {
  return 'light';
}

export function useWindowDimensions() {
  return { width: 402, height: 874, scale: 3, fontScale: 1 };
}

export type StyleProp<T> = T | T[] | null | undefined | false;
export type ViewStyle = Record<string, unknown>;
export type TextStyle = Record<string, unknown>;
export type TextInputProps = Props;
