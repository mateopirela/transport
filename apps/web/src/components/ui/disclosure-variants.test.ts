import { findStrictHygieneViolations } from '@transport/shared';
import { describe, expect, it } from 'vitest';

import {
  disclosureBodyVariants,
  disclosureSummaryVariants,
  disclosureVariants,
} from './disclosure-variants';
import { groupRow } from './variants';

const classes = (value: string) => value.split(/\s+/u);
const LOOKS = ['row', 'cell', 'inline'] as const;
const TONES = ['neutral', 'accent', 'red'] as const;

describe('disclosureVariants', () => {
  it('is a row of a group by default, with its inset separator', () => {
    expect(classes(disclosureVariants())).toEqual(expect.arrayContaining(classes(groupRow)));
  });

  it('stands alone as a cell: a hairline, no radius, no shadow', () => {
    const cell = classes(disclosureVariants({ look: 'cell' }));
    expect(cell).toEqual(expect.arrayContaining(['border', 'bg-cell']));
    expect(cell.some((c) => c.startsWith('rounded'))).toBe(false);
    expect(cell.some((c) => c.startsWith('shadow'))).toBe(false);
  });

  it('draws nothing around itself when inline', () => {
    const inline = classes(disclosureVariants({ look: 'inline' }));
    expect(inline).not.toContain('border');
    expect(inline).not.toContain('bg-cell');
  });
});

describe('disclosureSummaryVariants', () => {
  it('is as tall as a row and hides the native marker', () => {
    const summary = classes(disclosureSummaryVariants());
    expect(summary).toEqual(
      expect.arrayContaining(['min-h-table-row', 'list-none', 'text-subhead']),
    );
    expect(summary).toContain('[&::-webkit-details-marker]:hidden');
  });

  it('is a short line of text when inline', () => {
    const inline = classes(disclosureSummaryVariants({ look: 'inline' }));
    expect(inline).toContain('text-subhead');
    expect(inline).not.toContain('min-h-table-row');
  });

  it('gives each tone its AA text token, and no green', () => {
    expect(classes(disclosureSummaryVariants({ tone: 'neutral' }))).toContain('text-text');
    expect(classes(disclosureSummaryVariants({ tone: 'accent' }))).toContain('text-accent-text');
    expect(classes(disclosureSummaryVariants({ tone: 'red' }))).toContain('text-red-text');
  });

  it('never puts accent text on the raised surface (§1.1)', () => {
    for (const look of LOOKS) {
      expect(disclosureSummaryVariants({ look, tone: 'accent' })).not.toMatch(/bg-surface-high/u);
    }
  });

  it('shows its focus with an outline, never switching the outline off', () => {
    for (const look of LOOKS) {
      const summary = classes(disclosureSummaryVariants({ look }));
      expect(summary).toContain('focus-visible:outline-2');
      expect(summary).not.toContain('outline-none');
    }
  });

  // The retired keys are the strict hygiene's (src/hygiene.test.ts walks the kit).
  it('never writes a colour or a size by hand, nor a shadow', () => {
    for (const look of LOOKS) {
      for (const tone of TONES) {
        const value = [
          disclosureVariants({ look }),
          disclosureSummaryVariants({ look, tone }),
          disclosureBodyVariants({ look }),
        ].join(' ');
        expect(value).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(|text-(xs|sm|base|lg|xl)\b|shadow/iu);
        expect(findStrictHygieneViolations(value, 'web')).toEqual([]);
      }
    }
  });
});

describe('disclosureBodyVariants', () => {
  it('insets the content like the summary, flush when inline', () => {
    expect(classes(disclosureBodyVariants())).toContain('px-4');
    expect(classes(disclosureBodyVariants({ look: 'inline' }))).not.toContain('px-4');
  });

  it('opens a cell on its own under a hairline', () => {
    expect(classes(disclosureBodyVariants({ look: 'cell' }))).toContain('border-t');
    expect(classes(disclosureBodyVariants())).not.toContain('border-t');
  });
});
