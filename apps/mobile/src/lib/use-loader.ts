import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

export type LoaderState<T> =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

/**
 * Loads data when the screen gains focus (so lists refresh after editing a
 * detail screen) and on demand. `load` must be stable (useCallback). A failed
 * refresh keeps the data already shown.
 */
export function useLoader<T>(load: () => Promise<T>) {
  const [state, setState] = useState<LoaderState<T>>({ status: 'loading' });

  const reload = useCallback(async () => {
    try {
      const data = await load();
      setState({ status: 'ready', data });
    } catch {
      setState((current) => (current.status === 'ready' ? current : { status: 'error' }));
    }
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { state, reload };
}
