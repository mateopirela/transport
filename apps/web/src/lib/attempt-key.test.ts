import { describe, expect, it } from 'vitest';

import { nextAttemptKey } from './attempt-key';

const KEY = 'bf200000-0000-4000-8000-000000000001';

describe('nextAttemptKey', () => {
  it('keeps the key while the attempt has not succeeded', () => {
    const generate = () => 'unused';
    expect(nextAttemptKey(KEY, {}, generate)).toBe(KEY);
    expect(nextAttemptKey(KEY, { error: 'No se pudo' }, generate)).toBe(KEY);
    expect(nextAttemptKey(KEY, { fieldErrors: { kind: 'Obligatorio' } }, generate)).toBe(KEY);
  });

  it('starts a new attempt after a success', () => {
    expect(nextAttemptKey(KEY, { message: 'Enviada' }, () => 'next')).toBe('next');
  });

  it('generates UUIDs by default', () => {
    const next = nextAttemptKey(KEY, { message: 'Enviada' });
    expect(next).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(next).not.toBe(KEY);
  });
});
