import { createElement, type ReactNode } from 'react';

const insets = { top: 59, bottom: 34, left: 0, right: 0 };

export function useSafeAreaInsets() {
  return insets;
}

export function SafeAreaView(props: Record<string, unknown> & { children?: ReactNode }) {
  return createElement('SafeAreaView', props);
}

export function SafeAreaProvider({ children }: { children?: ReactNode }) {
  return children;
}
