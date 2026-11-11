/**
 * Whether the button that confirms of a `ConfirmDialog` is busy: when the
 * caller says so, or while the dialog's own run (its callback, or its form
 * being sent) is in flight. A caller's `pending={false}` adds nothing; it
 * never switches that guard off, so a second press cannot confirm twice.
 */
export function confirmBusy(pending: boolean | undefined, running: boolean): boolean {
  return pending === true || running;
}
