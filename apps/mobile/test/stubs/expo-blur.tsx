import { createElement, type ReactNode } from 'react';

export function BlurView(props: Record<string, unknown> & { children?: ReactNode }) {
  return createElement('BlurView', props);
}
