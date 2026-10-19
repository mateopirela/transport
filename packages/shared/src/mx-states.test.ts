import { describe, expect, it } from 'vitest';

import { isMxState, MX_STATES } from './mx-states';

describe('MX_STATES', () => {
  it('lists the 32 federative entities once, in alphabetical order', () => {
    expect(MX_STATES).toHaveLength(32);
    expect(new Set(MX_STATES).size).toBe(32);
    expect([...MX_STATES].sort((a, b) => a.localeCompare(b, 'es'))).toEqual([...MX_STATES]);
  });

  it('recognizes a state and nothing else', () => {
    expect(isMxState('Nuevo León')).toBe(true);
    expect(isMxState('Jalisco')).toBe(true);
    expect(isMxState('Texas')).toBe(false);
    expect(isMxState('nuevo león')).toBe(false);
    expect(isMxState(null)).toBe(false);
  });
});
