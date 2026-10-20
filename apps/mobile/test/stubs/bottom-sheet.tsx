import { createElement, useImperativeHandle, type ReactNode, type Ref } from 'react';

/** How many times a sheet was presented and dismissed, for the tests to read. */
export const sheetCalls = { present: 0, dismiss: 0 };

export function resetSheetCalls() {
  sheetCalls.present = 0;
  sheetCalls.dismiss = 0;
}

export function BottomSheetTextInput(props: Record<string, unknown>) {
  return createElement('BottomSheetTextInput', props);
}

/** A sheet that is always rendered (its content is what the tests read). */
export function BottomSheetModal({
  ref,
  children,
}: {
  ref?: Ref<{ present: () => void; dismiss: () => void }>;
  children?: ReactNode;
}) {
  useImperativeHandle(ref, () => ({
    present: () => {
      sheetCalls.present += 1;
    },
    dismiss: () => {
      sheetCalls.dismiss += 1;
    },
  }));
  return createElement('BottomSheetModal', null, children);
}

export function BottomSheetScrollView(props: Record<string, unknown> & { children?: ReactNode }) {
  return createElement('BottomSheetScrollView', props);
}

export function BottomSheetBackdrop() {
  return null;
}

export type BottomSheetBackdropProps = Record<string, unknown>;
