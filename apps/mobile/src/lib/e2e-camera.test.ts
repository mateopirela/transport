import { describe, expect, it } from 'vitest';

import { FAKE_PHOTO_SIZE, fakePhotoBase64, isFakeCameraEnabled } from './e2e-camera';

describe('stand-in camera of the end-to-end flows (F14)', () => {
  it('is on only in development builds that ask for it', () => {
    expect(isFakeCameraEnabled('1', true)).toBe(true);
    expect(isFakeCameraEnabled(' 1 ', true)).toBe(true);
    // A release build never fakes the evidence, whatever its environment says.
    expect(isFakeCameraEnabled('1', false)).toBe(false);
    for (const flag of [undefined, '', '0', 'true', 'yes']) {
      expect(isFakeCameraEnabled(flag, true)).toBe(false);
    }
  });

  it('returns a JPEG of the declared size', () => {
    const bytes = Uint8Array.from(atob(fakePhotoBase64()), (c) => c.charCodeAt(0));
    const u16 = (at: number) => ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0);
    // SOI marker first, EOI marker last.
    expect(u16(0)).toBe(0xffd8);
    expect(u16(bytes.length - 2)).toBe(0xffd9);
    // Height and width of the baseline frame header (SOF0: FF C0).
    const sof = bytes.findIndex((b, i) => b === 0xff && bytes[i + 1] === 0xc0);
    expect(sof).toBeGreaterThan(0);
    expect(u16(sof + 5)).toBe(FAKE_PHOTO_SIZE);
    expect(u16(sof + 7)).toBe(FAKE_PHOTO_SIZE);
  });
});
