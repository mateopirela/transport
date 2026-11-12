import { describe, expect, it } from 'vitest';

// D42 (plan-registro.md §0.1): what is typed in the sign-up, the sign-in, the
// company form and the invitation forms lives only in the screens' state. No
// screen of the access writes to the phone's storage, where a password would
// outlive the form. (The invitation token is kept by lib/auth.ts through its
// injected store; lib/auth.test.ts checks that a sign-up leaves it empty.)

declare global {
  interface ImportMeta {
    glob(
      patterns: readonly string[],
      options: { query: '?raw'; import: 'default'; eager: true },
    ): Record<string, string>;
  }
}

const SOURCES = import.meta.glob(
  [
    // `(auth)` would read as a glob group: the folder is matched by its files.
    './app/*/sign-in.tsx',
    './app/*/sign-up.tsx',
    './app/company.tsx',
    './app/invitacion/*.tsx',
    './components/carrier-kind-choice.tsx',
    './components/field-scroll.ts',
    './components/invitation-entry.tsx',
    './lib/sign-up.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
);

const STORAGE =
  /\b(?:AsyncStorage|SecureStore|setItemAsync|setItem|localStorage|sessionStorage)\b|secure-store|async-storage/u;

describe('the access screens keep nothing on the phone', () => {
  it('reads the sign-up, the sign-in, the company form and the invitation', () => {
    expect(Object.keys(SOURCES)).toEqual(
      expect.arrayContaining([
        './app/(auth)/sign-up.tsx',
        './app/(auth)/sign-in.tsx',
        './app/company.tsx',
        './app/invitacion/[token].tsx',
      ]),
    );
  });

  it.each(Object.keys(SOURCES))('%s does not touch the storage', (path) => {
    expect(SOURCES[path]).not.toMatch(STORAGE);
  });
});
