import { shareLinksCopy } from '@transport/shared';
import { describe, expect, it } from 'vitest';

import { shareErrorMessage } from './errors';

const e = shareLinksCopy.errors;

describe('shareErrorMessage', () => {
  it('maps the RPC errors to Spanish copy', () => {
    expect(shareErrorMessage({ code: '42501', message: 'load not found' })).toBe(e.notFound);
    expect(shareErrorMessage({ code: 'PT429', message: 'rate limit exceeded' })).toBe(
      e.rateLimited,
    );
    expect(
      shareErrorMessage({ code: '22023', message: 'p_valid_for_hours must be between 1 and 720' }),
    ).toBe(e.invalidValidity);
    expect(
      shareErrorMessage({ code: '22023', message: 'only a published load can be shared' }),
    ).toBe(e.notShareable);
    expect(shareErrorMessage({ code: '22023', message: 'a cancelled trip cannot be shared' })).toBe(
      e.notShareable,
    );
  });

  it('falls back to a generic message', () => {
    expect(shareErrorMessage({ code: 'PGRST301' })).toBe(e.generic);
    expect(shareErrorMessage({})).toBe(e.generic);
  });
});
