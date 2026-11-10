import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { TERMS_VERSION } from '@transport/shared';
import { describe, expect, it } from 'vitest';

// The demo seed (supabase/seed.sql) and the apps must agree on the version of
// the terms (I1): a demo account that accepted an older version would be sent
// to the acceptance screen, and every E2E flow would stop there.
const SEED = readFileSync(
  fileURLToPath(new URL('../../supabase/seed.sql', import.meta.url)),
  'utf8',
);

describe('demo seed', () => {
  it('accepts the current version of the terms for every account', () => {
    expect(SEED).toContain(`'terms_version', '${TERMS_VERSION}'`);
  });
});
