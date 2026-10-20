import { createContext, createElement, useContext, type ReactNode } from 'react';

const insets = { top: 59, bottom: 34, left: 0, right: 0 };

/** As the library: the insets of the nearest provider, the phone's by default. */
export const SafeAreaInsetsContext = createContext<typeof insets | null>(insets);

export function useSafeAreaInsets() {
  return useContext(SafeAreaInsetsContext) ?? insets;
}

export function SafeAreaView(props: Record<string, unknown> & { children?: ReactNode }) {
  return createElement('SafeAreaView', props);
}

export function SafeAreaProvider({ children }: { children?: ReactNode }) {
  return children;
}
