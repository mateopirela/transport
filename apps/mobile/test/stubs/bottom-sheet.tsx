import { createElement, type ReactNode } from 'react';

export function BottomSheetTextInput(props: Record<string, unknown>) {
  return createElement('BottomSheetTextInput', props);
}

export function BottomSheetModal({ children }: { children?: ReactNode }) {
  return createElement('BottomSheetModal', null, children);
}

export function BottomSheetScrollView(props: Record<string, unknown> & { children?: ReactNode }) {
  return createElement('BottomSheetScrollView', props);
}

export function BottomSheetBackdrop() {
  return null;
}

export type BottomSheetBackdropProps = Record<string, unknown>;
