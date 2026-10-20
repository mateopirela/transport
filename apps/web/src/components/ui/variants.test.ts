import { describe, expect, it } from 'vitest';

import { cn } from '@/lib/utils';

import { buttonVariants, PILL_TONES, pillVariants, tagVariants } from './variants';

const classes = (value: string) => value.split(/\s+/u);

describe('buttonVariants', () => {
  it('is a pill, 44 px, the primary by default', () => {
    const base = classes(buttonVariants());
    expect(base).toEqual(expect.arrayContaining(['rounded-full', 'h-11', 'bg-accent']));
    expect(base).toContain('text-accent-ink');
  });

  it('gives each variant its look', () => {
    expect(classes(buttonVariants({ variant: 'primary' }))).toContain('bg-accent');
    expect(classes(buttonVariants({ variant: 'secondary' }))).toEqual(
      expect.arrayContaining(['bg-cell', 'border', 'text-text']),
    );
    expect(classes(buttonVariants({ variant: 'plain' }))).toContain('text-text-dim');
    expect(classes(buttonVariants({ variant: 'destructive' }))).toContain('text-red-text');
  });

  it('fills with the accent only in the primary', () => {
    for (const variant of ['secondary', 'plain', 'destructive', 'link'] as const) {
      expect(classes(buttonVariants({ variant }))).not.toContain('bg-accent');
    }
  });

  it('keeps the old names as aliases of the new looks', () => {
    const look = (variant: Parameters<typeof buttonVariants>[0]) =>
      classes(buttonVariants(variant)).sort();
    expect(look({ variant: 'accent' })).toEqual(look({ variant: 'primary' }));
    expect(look({ variant: 'default' })).toEqual(look({ variant: 'primary' }));
    expect(look({ variant: 'outline' })).toEqual(look({ variant: 'secondary' }));
    expect(look({ variant: 'ghost' })).toEqual(look({ variant: 'plain' }));
    expect(look({ size: 'lg' })).toEqual(look({ size: 'default' }));
  });

  it('is 36 px when small', () => {
    expect(classes(buttonVariants({ size: 'sm' }))).toContain('h-9');
  });

  it('never casts a shadow (§1.3)', () => {
    for (const variant of ['primary', 'secondary', 'plain', 'destructive', 'link'] as const) {
      expect(buttonVariants({ variant })).not.toMatch(/(^|\s)shadow/u);
    }
  });

  it('lets a link drop the height and padding of a button', () => {
    const merged = classes(cn(buttonVariants({ variant: 'link' })));
    expect(merged).toEqual(expect.arrayContaining(['h-auto', 'px-0']));
    expect(merged).not.toContain('h-11');
  });
});

describe('pillVariants', () => {
  it('puts each tone on its 14 % with its AA text tone', () => {
    expect(classes(pillVariants({ tone: 'ok' }))).toEqual(
      expect.arrayContaining(['bg-ok/14', 'text-ok-text']),
    );
    expect(classes(pillVariants({ tone: 'amber' }))).toEqual(
      expect.arrayContaining(['bg-amber/14', 'text-amber-text']),
    );
    expect(classes(pillVariants({ tone: 'red' }))).toEqual(
      expect.arrayContaining(['bg-red/14', 'text-red-text']),
    );
    expect(classes(pillVariants({ tone: 'accent' }))).toEqual(
      expect.arrayContaining(['bg-accent/14', 'text-accent-text']),
    );
  });

  it('is neutral by default', () => {
    expect(pillVariants()).toBe(pillVariants({ tone: 'neutral' }));
    expect(classes(pillVariants())).toEqual(
      expect.arrayContaining(['bg-surface-high', 'text-text-dim']),
    );
  });

  it('never writes a base tone as small text', () => {
    for (const tone of PILL_TONES) {
      expect(classes(pillVariants({ tone }))).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/^text-(ok|amber|red|accent)$/u)]),
      );
      expect(classes(tagVariants({ tone }))).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/^text-(ok|amber|red|accent)$/u)]),
      );
    }
  });

  it('is a footnote pill, and a tag has the small radius', () => {
    expect(classes(pillVariants())).toEqual(
      expect.arrayContaining(['rounded-full', 'text-footnote']),
    );
    expect(classes(tagVariants())).toContain('rounded-sm');
  });
});

describe('cn', () => {
  it('keeps a type style next to a colour', () => {
    expect(cn('text-footnote', 'text-text-dim')).toBe('text-footnote text-text-dim');
  });

  it('lets a later type style win', () => {
    expect(cn('text-footnote', 'text-title1')).toBe('text-title1');
  });
});
