import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { TERMS_VERSION } from '@transport/shared';
import { describe, expect, it } from 'vitest';

// The database only keeps acceptances of the current version of the terms
// (public.current_terms_version, I1), and the apps ask for TERMS_VERSION: if
// they disagree, nobody can accept the terms. The function is (re)defined by
// migrations; the latest definition is the one that counts.
const MIGRATIONS = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url));
const DEFINITION =
  /create (?:or replace )?function public\.current_terms_version\(\)[\s\S]*?\$\$\s*select\s+'([^']+)'(?:::text)?\s*\$\$/giu;

function currentTermsVersionInDatabase(): string | undefined {
  let version: string | undefined;
  for (const file of readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    for (const match of readFileSync(`${MIGRATIONS}${file}`, 'utf8').matchAll(DEFINITION)) {
      version = match[1];
    }
  }
  return version;
}

describe('version of the terms', () => {
  it('is the same in the database and in the apps', () => {
    expect(currentTermsVersionInDatabase()).toBe(TERMS_VERSION);
  });
});
