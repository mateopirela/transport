import { beforeEach, describe, expect, it, vi } from 'vitest';

// capturePhoto with the native modules replaced: only its outcome matters here.
vi.hoisted(() => {
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;
});
vi.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: vi.fn(),
  launchCameraAsync: vi.fn(),
}));
vi.mock('expo-file-system', () => ({ Directory: vi.fn(), File: vi.fn(), Paths: {} }));
vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: vi.fn(),
  randomUUID: () => '00000000-0000-4000-8000-000000000000',
}));
vi.mock('./document-upload', () => ({ compressPhoto: vi.fn() }));
vi.mock('./location', () => ({ currentPosition: vi.fn() }));

import * as ImagePicker from 'expo-image-picker';

import { capturePhoto } from './evidence-api';

const input = {
  tripId: '7f1c2a8e-4b6d-4c3e-9a1f-2d5e6f708192',
  stage: 'pickup' as const,
  incidentId: null,
};

describe('capturePhoto', () => {
  beforeEach(() => {
    vi.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue({
      granted: true,
    } as ImagePicker.CameraPermissionResponse);
  });

  it('fails, instead of throwing, when the camera cannot open (iOS simulator, F14)', async () => {
    vi.mocked(ImagePicker.launchCameraAsync).mockRejectedValue(
      new Error('Camera not available on simulator'),
    );
    await expect(capturePhoto(input)).resolves.toEqual({ status: 'failed' });
  });

  it('is cancelled when the operator closes the camera', async () => {
    vi.mocked(ImagePicker.launchCameraAsync).mockResolvedValue({ canceled: true, assets: null });
    await expect(capturePhoto(input)).resolves.toEqual({ status: 'cancelled' });
  });

  it('is denied without camera permission, and never opens the camera', async () => {
    vi.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue({
      granted: false,
    } as ImagePicker.CameraPermissionResponse);
    vi.mocked(ImagePicker.launchCameraAsync).mockClear();
    await expect(capturePhoto(input)).resolves.toEqual({ status: 'denied' });
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  });
});
