import { describe, expect, it } from 'vitest';

import { disclosureBody, disclosureFrame, disclosureSummary } from './disclosure-variants';

describe('disclosure', () => {
  it('is a cell of the system: white, radius 16, a hairline, no shadow', () => {
    expect(disclosureFrame).toContain('bg-cell');
    expect(disclosureFrame).toContain('rounded-2xl');
    expect(disclosureFrame).toContain('border');
    expect(disclosureFrame).not.toMatch(/shadow/u);
  });

  it('gives the summary the tone of its action', () => {
    expect(disclosureSummary()).toContain('text-text');
    expect(disclosureSummary({ tone: 'red' })).toContain('text-red-text');
    expect(disclosureSummary({ tone: 'ok' })).toContain('text-ok-text');
    expect(disclosureSummary({ tone: 'accent' })).toContain('text-accent-text');
    // A row of at least 50 px and no browser marker.
    expect(disclosureSummary()).toContain('min-h-12.5');
    expect(disclosureSummary()).toContain('list-none');
  });

  it('separates what opens with a hairline', () => {
    expect(disclosureBody).toContain('border-t');
  });
});
