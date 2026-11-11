import { STATE_TONE_KEYS, STATE_TONES } from '@transport/shared';
import { describe, expect, it } from 'vitest';

import { cn } from '@/lib/utils';

import {
  buttonVariants,
  fieldControl,
  focusRing,
  moneyVariants,
  PILL_TONES,
  pillVariants,
  STEP_STATES,
  stepLabelVariants,
  stepMarkVariants,
  surface,
  tableCellClass,
  tagVariants,
} from './variants';

const classes = (value: string) => value.split(/\s+/u);
/** `surfaceHigh` -> `surface-high`: the class name of a palette key. */
const kebab = (key: string) => key.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);

const BUTTONS = ['primary', 'secondary', 'plain', 'destructive', 'danger', 'link'] as const;
const SIZES = ['default', 'sm', 'lg', 'icon'] as const;

describe('buttonVariants', () => {
  it('has the radius of 8, is 40 px and the primary by default (§1.3)', () => {
    const base = classes(buttonVariants());
    expect(base).toEqual(expect.arrayContaining(['rounded-lg', 'h-control', 'bg-accent']));
    expect(base).toContain('text-accent-ink');
    expect(base).not.toContain('rounded-full');
  });

  it('gives each variant its look', () => {
    expect(classes(buttonVariants({ variant: 'secondary' }))).toEqual(
      expect.arrayContaining(['bg-cell', 'border', 'border-control', 'text-text']),
    );
    expect(classes(buttonVariants({ variant: 'plain' }))).toContain('text-text-dim');
    expect(classes(buttonVariants({ variant: 'destructive' }))).toEqual(
      expect.arrayContaining(['border', 'text-red-text']),
    );
    expect(classes(buttonVariants({ variant: 'danger' }))).toEqual(
      expect.arrayContaining(['bg-red', 'text-red-ink']),
    );
  });

  it('fills with the accent only in the primary', () => {
    for (const variant of BUTTONS) {
      const filled = classes(buttonVariants({ variant })).includes('bg-accent');
      expect(filled, variant).toBe(variant === 'primary');
    }
  });

  it('never writes the accent as text, only its AA tone, and never on the raised surface', () => {
    for (const variant of BUTTONS) {
      const value = classes(buttonVariants({ variant }));
      expect(value).not.toContain('text-accent');
      if (value.includes('text-accent-text')) {
        expect(value.some((c) => c.endsWith('bg-surface-high'))).toBe(false);
      }
    }
  });

  it('is 32 px when small and 48 px when large', () => {
    expect(classes(buttonVariants({ size: 'sm' }))).toContain('h-8');
    expect(classes(buttonVariants({ size: 'lg' }))).toContain('h-12');
    expect(classes(buttonVariants({ size: 'icon' }))).toContain('size-control');
  });

  it('never casts a shadow and always shows its focus (§1.3)', () => {
    for (const variant of BUTTONS) {
      for (const size of SIZES) {
        const value = buttonVariants({ variant, size });
        expect(value).not.toMatch(/(^|\s|:)shadow/u);
        expect(value).toContain(focusRing);
        expect(classes(value)).not.toContain('outline-none');
      }
    }
  });

  it('lets a link drop the height and padding of a button', () => {
    const merged = classes(cn(buttonVariants({ variant: 'link' })));
    expect(merged).toEqual(expect.arrayContaining(['h-auto', 'px-0']));
    expect(merged).not.toContain('h-control');
  });
});

describe('pillVariants and tagVariants', () => {
  it('draw the six tones of the shared map, no more', () => {
    expect(PILL_TONES).toEqual(STATE_TONES);
  });

  it('fill each tone with its colour and write on it with its ink (§1.1)', () => {
    for (const variants of [pillVariants, tagVariants]) {
      for (const tone of PILL_TONES) {
        const keys = STATE_TONE_KEYS[tone];
        const value = classes(variants({ tone }));
        expect(value, tone).toEqual(
          expect.arrayContaining([`bg-${kebab(keys.fill)}`, `text-${kebab(keys.ink)}`]),
        );
        expect(value.includes('border'), tone).toBe(keys.border !== null);
        if (keys.border) expect(value).toContain(`border-${kebab(keys.border)}`);
      }
    }
  });

  it('are inactive by default', () => {
    expect(pillVariants()).toBe(pillVariants({ tone: 'inactive' }));
    expect(tagVariants()).toBe(tagVariants({ tone: 'inactive' }));
  });

  it('never write a base tone as small text, nor paint anything green', () => {
    for (const variants of [pillVariants, tagVariants]) {
      for (const tone of PILL_TONES) {
        const value = classes(variants({ tone }));
        expect(value).not.toEqual(
          expect.arrayContaining([expect.stringMatching(/^text-(accent|amber|red|info)$/u)]),
        );
        expect(value.join(' ')).not.toMatch(/\bok\b|green|accent-soft|\/14/u);
      }
    }
  });

  it('are a pill of 999 in footnote, and a tag of the small radius', () => {
    expect(classes(pillVariants())).toEqual(
      expect.arrayContaining(['rounded-full', 'text-footnote']),
    );
    expect(classes(tagVariants())).toEqual(expect.arrayContaining(['rounded-sm', 'text-caption']));
  });
});

describe('fields and surfaces', () => {
  it('give a field the small radius, a border in `control` and the focus ring', () => {
    const field = classes(fieldControl);
    expect(field).toEqual(expect.arrayContaining(['rounded-sm', 'border', 'border-control']));
    expect(fieldControl).toContain(focusRing);
    expect(field).not.toContain('outline-none');
    expect(field.some((c) => c.includes('shadow'))).toBe(false);
  });

  it('draw a surface as a cell with a hairline and no radius', () => {
    expect(classes(surface)).toEqual(['border', 'bg-cell']);
  });
});

describe('moneyVariants', () => {
  it('writes every amount in tabular digits, on one line', () => {
    for (const size of ['inline', 'title', 'numeral'] as const) {
      expect(classes(moneyVariants({ size }))).toEqual(
        expect.arrayContaining(['tabular-nums', 'whitespace-nowrap']),
      );
    }
  });

  it('makes the main figure of a screen the numeral, and takes the size around it inline', () => {
    expect(classes(moneyVariants({ size: 'numeral' }))).toContain('text-numeral');
    expect(classes(moneyVariants({ size: 'title' }))).toContain('text-title2');
    expect(moneyVariants()).toBe(moneyVariants({ size: 'inline' }));
    expect(classes(moneyVariants()).some((c) => /^text-/u.test(c))).toBe(false);
  });
});

describe('step variants', () => {
  it('mark the current step with the accent and a done one without colour', () => {
    expect(classes(stepMarkVariants({ state: 'current' }))).toEqual(
      expect.arrayContaining(['bg-accent', 'text-accent-ink']),
    );
    expect(classes(stepMarkVariants({ state: 'done' }))).toEqual(
      expect.arrayContaining(['bg-surface-high', 'text-text']),
    );
    expect(classes(stepMarkVariants({ state: 'upcoming' }))).toEqual(
      expect.arrayContaining(['border', 'text-text-dim']),
    );
  });

  it('tell the current step by its weight, not by its colour', () => {
    expect(classes(stepLabelVariants({ state: 'current' }))).toEqual(
      expect.arrayContaining(['font-semibold', 'text-text']),
    );
    for (const state of STEP_STATES) {
      expect(stepLabelVariants({ state })).not.toMatch(/text-accent|text-red|text-amber/u);
    }
  });
});

describe('tableCellClass', () => {
  it('lines a number up to the right in tabular digits (§1.2)', () => {
    const cell = classes(tableCellClass({ numeric: true }));
    expect(cell).toEqual(expect.arrayContaining(['text-right', 'tabular-nums']));
    expect(cell).not.toContain('text-left');
  });

  it('lines text up to the left unless asked', () => {
    expect(classes(tableCellClass())).toContain('text-left');
    expect(classes(tableCellClass({ align: 'right' }))).toContain('text-right');
    expect(classes(tableCellClass({ numeric: true, align: 'left' }))).toContain('text-left');
  });
});

describe('cn', () => {
  it('keeps a type style next to a colour', () => {
    expect(cn('text-footnote', 'text-text-dim')).toBe('text-footnote text-text-dim');
    expect(cn('text-table', 'text-text-dim')).toBe('text-table text-text-dim');
  });

  it('lets a later type style win', () => {
    expect(cn('text-footnote', 'text-title1')).toBe('text-title1');
    expect(cn('text-subhead', 'text-table')).toBe('text-table');
  });
});
