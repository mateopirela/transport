import { roadsCopy } from '@transport/shared';
import { describe, expect, it } from 'vitest';

import { roadAdminErrorMessage } from './road-errors';

const e = roadsCopy.admin.errors;

describe('roadAdminErrorMessage', () => {
  it('maps the known SQLSTATE codes of the admin road RPCs, never database text', () => {
    expect(roadAdminErrorMessage({ code: '23505', message: 'duplicate key value' })).toBe(
      e.duplicate,
    );
    expect(
      roadAdminErrorMessage({ code: '22023', message: 'consecutive segments must connect' }),
    ).toBe(e.unknownSegment);
    expect(roadAdminErrorMessage({ code: '22023', message: 'unknown or archived segment' })).toBe(
      e.unknownSegment,
    );
    expect(roadAdminErrorMessage({ code: '22023', message: 'a source is required' })).toBe(
      e.invalid,
    );
    expect(roadAdminErrorMessage({ code: '23514', message: 'violates check' })).toBe(e.invalid);
    expect(
      roadAdminErrorMessage({ code: '42501', message: 'only admins edit the road catalog' }),
    ).toBe(e.generic);
    expect(roadAdminErrorMessage(null)).toBe(e.generic);
  });
});
