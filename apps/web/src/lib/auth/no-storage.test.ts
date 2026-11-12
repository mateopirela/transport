import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// D42 (plan-registro.md §0.1): what is typed in the sign-up, the sign-in and
// the invitation forms lives only in the fields. No code of the access writes
// to the browser's storage, where a password would outlive the page.

const SOURCES = [
  '../../components/auth-forms.tsx',
  '../../components/invitation-forms.tsx',
  '../../app/(auth)/registro/page.tsx',
  '../../app/(auth)/login/page.tsx',
  '../../app/(auth)/invitacion/page.tsx',
  '../../app/(auth)/invitacion/[token]/page.tsx',
  '../../app/(auth)/completar-registro/page.tsx',
  '../../app/(auth)/restablecer/page.tsx',
  './actions.ts',
];

const STORAGE = /\b(?:localStorage|sessionStorage|indexedDB|document\.cookie|caches\.open)\b/u;

describe('the access forms keep nothing in the browser', () => {
  it.each(SOURCES)('%s does not touch localStorage, sessionStorage or cookies', (path) => {
    const source = readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
    expect(source).not.toMatch(STORAGE);
  });
});
