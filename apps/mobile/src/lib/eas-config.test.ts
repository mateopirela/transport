import { describe, expect, it } from 'vitest';

import easJson from '../../eas.json';

// Release profiles (B27): what reaches TestFlight / Play and with which EAS
// environment (its EXPO_PUBLIC_* variables point at staging or production).
interface Profile {
  extends?: string;
  distribution?: string;
  environment?: string;
  developmentClient?: boolean;
  env?: Record<string, string>;
}
interface EasJson {
  build: Record<string, Profile | undefined>;
  submit: Record<
    string,
    { ios?: Record<string, unknown>; android?: Record<string, unknown> } | undefined
  >;
}
const eas: EasJson = easJson;

describe('eas.json', () => {
  it('builds production for the stores against the production environment', () => {
    const production = eas.build.production;
    expect(production?.environment).toBe('production');
    expect(production?.distribution).toBeUndefined();
    expect(production?.developmentClient).toBeUndefined();
    expect(production?.env?.EXPO_PUBLIC_SENTRY_ENVIRONMENT).toBe('production');
  });

  it('keeps preview builds internal and on staging', () => {
    expect(eas.build.preview?.distribution).toBe('internal');
    expect(eas.build.preview?.environment).toBe('preview');
    expect(eas.build.preview?.env?.EXPO_PUBLIC_SENTRY_ENVIRONMENT).toBe('staging');
  });

  it('submits only to internal testing (TestFlight and the Play internal track)', () => {
    expect(Object.keys(eas.submit)).toEqual(['production']);
    expect(eas.submit.production?.ios).toBeDefined();
    expect(eas.submit.production?.android?.track).toBe('internal');
  });

  it('keeps store credentials and account ids out of the repo', () => {
    const text = JSON.stringify(eas);
    for (const key of ['serviceAccountKeyPath', 'ascApiKeyPath', 'appleId', 'ascAppId']) {
      expect(text).not.toContain(key);
    }
  });
});
