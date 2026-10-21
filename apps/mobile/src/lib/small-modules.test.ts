import { carrierSignUpSchema, validationMessages } from '@transport/shared';
import { describe, expect, it } from 'vitest';

import { invitationTokenParam, parseAuthRedirect } from './deep-links';
import { readMobileEnv } from './env';
import { validateForm } from './forms';
import { isOffline } from './network';
import { toProfileDetails } from './profile';
import { isExpoPushToken, pushSkipReason, pushTarget } from './push-policy';

describe('pushTarget', () => {
  const tripId = '5eed0008-0000-4000-8000-000000000001';

  it('opens the trip of a tapped push in the area of the user', () => {
    expect(pushTarget({ tripId }, 'operator')).toEqual({ pathname: '/trip' });
    expect(pushTarget({ tripId }, 'carrier')).toEqual({
      pathname: '/trip/[id]',
      params: { id: tripId },
    });
  });

  it('opens the unit to release for the carrier staff (G5), the trip for the operator', () => {
    const release = { taskId: tripId, tripId, vehicleId: '5eed0004-0000-4000-8000-000000000007' };
    expect(pushTarget(release, 'carrier')).toEqual({
      pathname: '/vehicle/[id]',
      params: { id: release.vehicleId },
    });
    expect(pushTarget(release, 'operator')).toEqual({ pathname: '/trip' });
    expect(pushTarget({ ...release, vehicleId: '../x' }, 'carrier')).toEqual({
      pathname: '/trip/[id]',
      params: { id: tripId },
    });
  });

  it('opens the internal chat of the trip for a message of it (H1)', () => {
    const message = { tripId, conversationId: tripId, type: 'internal_message' };
    expect(pushTarget(message, 'operator')).toEqual({
      pathname: '/chat/[tripId]',
      params: { tripId },
    });
    expect(pushTarget(message, 'carrier')).toEqual({
      pathname: '/trip/[id]',
      params: { id: tripId, chat: 'interno' },
    });
    expect(pushTarget(message, 'auth')).toBeNull();
    expect(pushTarget({ ...message, tripId: '../x' }, 'operator')).toBeNull();
  });

  it('ignores other areas, other payloads and malformed ids', () => {
    expect(pushTarget({ tripId }, 'auth')).toBeNull();
    expect(pushTarget({ tripId: '../x' }, 'carrier')).toBeNull();
    expect(pushTarget({ loadId: tripId }, 'carrier')).toBeNull();
    expect(pushTarget(null, 'carrier')).toBeNull();
  });
});

describe('readMobileEnv', () => {
  const base = { EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon' };

  it('accepts https anywhere and trims trailing slashes', () => {
    expect(
      readMobileEnv(
        {
          ...base,
          EXPO_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co/',
          EXPO_PUBLIC_EAS_PROJECT_ID: ' ',
        },
        { allowInsecureLocal: false },
      ),
    ).toEqual({
      ok: true,
      env: { supabaseUrl: 'https://abc.supabase.co', supabaseAnonKey: 'anon', easProjectId: null },
    });
  });

  it('accepts http only for local hosts in development builds', () => {
    for (const url of [
      'http://127.0.0.1:54321',
      'http://10.0.2.2:54321',
      'http://192.168.1.20:54321',
    ]) {
      expect(
        readMobileEnv({ ...base, EXPO_PUBLIC_SUPABASE_URL: url }, { allowInsecureLocal: true }).ok,
      ).toBe(true);
      expect(
        readMobileEnv({ ...base, EXPO_PUBLIC_SUPABASE_URL: url }, { allowInsecureLocal: false }).ok,
      ).toBe(false);
    }
    expect(
      readMobileEnv(
        { ...base, EXPO_PUBLIC_SUPABASE_URL: 'http://evil.example.com' },
        { allowInsecureLocal: true },
      ).ok,
    ).toBe(false);
  });

  it('reports missing or malformed values', () => {
    expect(readMobileEnv({}, { allowInsecureLocal: true })).toEqual({
      ok: false,
      problems: ['EXPO_PUBLIC_SUPABASE_URL is missing', 'EXPO_PUBLIC_SUPABASE_ANON_KEY is missing'],
    });
    expect(
      readMobileEnv(
        { ...base, EXPO_PUBLIC_SUPABASE_URL: 'not a url' },
        { allowInsecureLocal: true },
      ),
    ).toEqual({
      ok: false,
      problems: ['EXPO_PUBLIC_SUPABASE_URL is not a valid URL'],
    });
  });

  it('keeps the EAS project id when present', () => {
    const result = readMobileEnv(
      { ...base, EXPO_PUBLIC_SUPABASE_URL: 'https://x.co', EXPO_PUBLIC_EAS_PROJECT_ID: 'proj-1' },
      { allowInsecureLocal: false },
    );
    expect(result.ok && result.env.easProjectId).toBe('proj-1');
  });
});

describe('parseAuthRedirect', () => {
  it('reads a PKCE code from the query', () => {
    expect(parseAuthRedirect('transport://auth/callback?code=3f2a9c1e-7b4d-4c3e')).toEqual({
      kind: 'code',
      code: '3f2a9c1e-7b4d-4c3e',
    });
  });

  it('reads errors from the query or the fragment', () => {
    expect(
      parseAuthRedirect('transport://auth/callback#error=access_denied&error_code=otp_expired'),
    ).toEqual({
      kind: 'error',
      errorCode: 'otp_expired',
    });
    expect(parseAuthRedirect('transport://auth/callback?error=server_error')).toEqual({
      kind: 'error',
      errorCode: 'server_error',
    });
  });

  it('ignores implicit-flow tokens and malformed codes', () => {
    expect(
      parseAuthRedirect('transport://auth/callback#access_token=abc&refresh_token=def'),
    ).toEqual({
      kind: 'none',
    });
    expect(parseAuthRedirect('transport://auth/callback?code=<script>')).toEqual({ kind: 'none' });
    expect(parseAuthRedirect(null)).toEqual({ kind: 'none' });
    expect(parseAuthRedirect('transport://auth/callback')).toEqual({ kind: 'none' });
  });
});

describe('invitationTokenParam', () => {
  const token = 'A'.repeat(42) + '_';

  it('takes the first value when it is a well-formed token or link', () => {
    expect(invitationTokenParam(` ${token} `)).toBe(token);
    expect(invitationTokenParam([token, 'other'])).toBe(token);
    expect(invitationTokenParam(`transport://invitacion/${token}`)).toBe(token);
  });

  it('is null for anything else', () => {
    expect(invitationTokenParam(undefined)).toBeNull();
    expect(invitationTokenParam('ABCD-1234')).toBeNull();
    expect(invitationTokenParam('x'.repeat(400))).toBeNull();
  });
});

describe('validateForm', () => {
  it('returns parsed data or the first message per field', () => {
    const valid = validateForm(carrierSignUpSchema, {
      kind: 'carrier',
      fullName: 'Ana',
      email: 'ANA@x.mx',
      phone: '8112345678',
      password: 'camion2026',
      passwordConfirmation: 'camion2026',
    });
    expect(valid.ok && valid.data.email).toBe('ana@x.mx');

    const invalid = validateForm(carrierSignUpSchema, { fullName: '', email: 'x', phone: '1' });
    expect(invalid).toMatchObject({
      ok: false,
      errors: {
        fullName: validationMessages.required,
        email: validationMessages.email,
        phone: validationMessages.phone,
      },
    });
  });
});

describe('isOffline', () => {
  it('is offline only when NetInfo is sure', () => {
    expect(isOffline({ isConnected: false, isInternetReachable: null })).toBe(true);
    expect(isOffline({ isConnected: true, isInternetReachable: false })).toBe(true);
    expect(isOffline({ isConnected: true, isInternetReachable: true })).toBe(false);
    expect(isOffline({ isConnected: null, isInternetReachable: null })).toBe(false);
  });
});

describe('push policy', () => {
  it('skips push without an EAS project, on simulators or without permission', () => {
    expect(pushSkipReason({ isDevice: true, projectId: null, permissionGranted: true })).toBe(
      'no_project_id',
    );
    expect(pushSkipReason({ isDevice: false, projectId: 'p', permissionGranted: true })).toBe(
      'not_a_device',
    );
    expect(pushSkipReason({ isDevice: true, projectId: 'p', permissionGranted: false })).toBe(
      'permission_denied',
    );
    expect(pushSkipReason({ isDevice: true, projectId: 'p', permissionGranted: true })).toBeNull();
  });

  it('recognizes Expo push tokens', () => {
    expect(isExpoPushToken('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]')).toBe(true);
    expect(isExpoPushToken('ExpoPushToken[abcdefgh12]')).toBe(true);
    expect(isExpoPushToken('fcm-raw-token')).toBe(false);
  });
});

describe('toProfileDetails', () => {
  it('maps the profile row and its company', () => {
    expect(
      toProfileDetails({
        role: 'manager',
        company_id: 'c1',
        full_name: 'Ana',
        phone: '8112345678',
        companies: {
          legal_name: 'Fletes Ana',
          status: 'rejected',
          status_reason: 'Falta RFC',
          is_owner_operator: true,
        },
      }),
    ).toEqual({
      role: 'manager',
      companyId: 'c1',
      companyStatus: 'rejected',
      fullName: 'Ana',
      phone: '8112345678',
      companyName: 'Fletes Ana',
      companyStatusReason: 'Falta RFC',
      isOwnerOperator: true,
    });
  });

  it('handles users without a company', () => {
    expect(
      toProfileDetails({
        role: 'operator',
        company_id: null,
        full_name: null,
        phone: null,
        companies: null,
      }),
    ).toMatchObject({
      companyId: null,
      companyStatus: null,
      companyName: null,
      isOwnerOperator: false,
    });
  });
});
