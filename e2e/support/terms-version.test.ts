import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { TERMS_VERSION } from '@transport/shared';
import { describe, expect, it } from 'vitest';

// The database only keeps acceptances of the current version of the terms
// (public.current_terms_version, I1), and the apps ask for TERMS_VERSION: if
// they disagree, nobody can accept the terms. The function is (re)defined by
// migrations; the latest definition is the one that counts. The migrations
// are inputs of this package's test task (e2e/turbo.json), so a change there
// is never served from the Turbo cache.
const MIGRATIONS = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url));
const HEADER = /create (?:or replace )?function public\.current_terms_version\(\)/giu;
const BODY = /^[\s\S]*?\bas\s+\$\$([\s\S]*?)\$\$/u;
const VERSION = /'(\d{4}-\d{2}-\d{2})'/gu;

/** The latest definition of the function: its file and what follows the header. */
function latestDefinition(): { file: string; rest: string } | undefined {
  let latest: { file: string; rest: string } | undefined;
  const files = readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = readFileSync(`${MIGRATIONS}${file}`, 'utf8');
    for (const match of sql.matchAll(HEADER)) {
      latest = { file, rest: sql.slice(match.index + match[0].length) };
    }
  }
  return latest;
}

/** The single version literal in the body of the latest definition; throws otherwise. */
function currentTermsVersionInDatabase(): string {
  const definition = latestDefinition();
  if (!definition) throw new Error('no migration defines public.current_terms_version()');
  const body = BODY.exec(definition.rest)?.[1];
  if (body === undefined) {
    throw new Error(`cannot read the body of current_terms_version in ${definition.file}`);
  }
  const versions = [...body.matchAll(VERSION)].map((match) => match[1]);
  const [version] = versions;
  if (versions.length !== 1 || version === undefined) {
    throw new Error(`expected one version in current_terms_version in ${definition.file}`);
  }
  return version;
}

describe('version of the terms', () => {
  it('is the same in the database and in the apps', () => {
    expect(currentTermsVersionInDatabase()).toBe(TERMS_VERSION);
  });
});
