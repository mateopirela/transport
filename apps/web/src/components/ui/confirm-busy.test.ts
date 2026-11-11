import { describe, expect, it } from 'vitest';

import { confirmBusy } from './confirm-busy';

describe('confirmBusy', () => {
  it('is busy while the dialog runs, whatever the caller says', () => {
    expect(confirmBusy(undefined, true)).toBe(true);
    // `pending={false}` from a caller must not switch the dialog's own guard off.
    expect(confirmBusy(false, true)).toBe(true);
    expect(confirmBusy(true, true)).toBe(true);
  });

  it('is busy while the caller says so, even before the dialog runs', () => {
    expect(confirmBusy(true, false)).toBe(true);
  });

  it('is free when nothing runs', () => {
    expect(confirmBusy(undefined, false)).toBe(false);
    expect(confirmBusy(false, false)).toBe(false);
  });
});
