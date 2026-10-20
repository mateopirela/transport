import { describe, expect, it } from 'vitest';

import {
  disclosureBodyVariants,
  disclosureSummaryVariants,
  disclosureVariants,
} from './disclosure-variants';
import { groupRow } from './variants';

const classes = (value: string) => value.split(/\s+/u);
const LOOKS = ['row', 'cell', 'inline'] as const;
const TONES = ['neutral', 'accent', 'ok', 'red'] as const;

describe('disclosureVariants', () => {
  it('is a row of a group by default, with its inset separator', () => {
    expect(classes(disclosureVariants())).toEqual(expect.arrayContaining(classes(groupRow)));
  });

  it('stands alone as a cell: white, radius 16, a hairline, no shadow', () => {
    const cell = classes(disclosureVariants({ look: 'cell' }));
    expect(cell).toEqual(expect.arrayContaining(['rounded-2xl', 'border', 'bg-cell']));
    expect(cell.some((c) => c.startsWith('shadow'))).toBe(false);
  });

  it('draws nothing around itself when inline', () => {
    const inline = classes(disclosureVariants({ look: 'inline' }));
    expect(inline).not.toContain('border');
    expect(inline).not.toContain('bg-cell');
  });
});

describe('disclosureSummaryVariants', () => {
  it('is as tall as a cell and hides the native marker', () => {
    const summary = classes(disclosureSummaryVariants());
    expect(summary).toEqual(expect.arrayContaining(['min-h-12.5', 'list-none', 'text-body']));
    expect(summary).toContain('[&::-webkit-details-marker]:hidden');
  });

  it('is a short line of text when inline', () => {
    const inline = classes(disclosureSummaryVariants({ look: 'inline' }));
    expect(inline).toContain('text-subhead');
    expect(inline).not.toContain('min-h-12.5');
  });

  it('gives each tone its AA text token', () => {
    expect(classes(disclosureSummaryVariants({ tone: 'neutral' }))).toContain('text-text');
    expect(classes(disclosureSummaryVariants({ tone: 'accent' }))).toContain('text-accent-text');
    expect(classes(disclosureSummaryVariants({ tone: 'ok' }))).toContain('text-ok-text');
    expect(classes(disclosureSummaryVariants({ tone: 'red' }))).toContain('text-red-text');
  });

  it('never writes a colour or a size by hand, nor a shadow', () => {
    for (const look of LOOKS) {
      for (const tone of TONES) {
        const value = [
          disclosureVariants({ look }),
          disclosureSummaryVariants({ look, tone }),
          disclosureBodyVariants({ look }),
        ].join(' ');
        expect(value).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(|text-(xs|sm|base|lg|xl)\b|shadow/iu);
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
