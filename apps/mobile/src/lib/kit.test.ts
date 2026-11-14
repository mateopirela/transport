import { describe, expect, it } from 'vitest';

import { badgeText, barAboveKeyboard, chunkRows, stepNumber, stepStates } from './kit';

describe('stepStates', () => {
  it('marks what is behind as done, the step in course and what waits', () => {
    expect(stepStates(4, 0)).toEqual(['current', 'pending', 'pending', 'pending']);
    expect(stepStates(4, 2)).toEqual(['done', 'done', 'current', 'pending']);
    expect(stepStates(4, 3)).toEqual(['done', 'done', 'done', 'current']);
  });

  it('has no step in course before the first one nor after the last', () => {
    expect(stepStates(3, -1)).toEqual(['pending', 'pending', 'pending']);
    expect(stepStates(3, 3)).toEqual(['done', 'done', 'done']);
    expect(stepStates(3, 99)).toEqual(['done', 'done', 'done']);
    expect(stepStates(3, Number.POSITIVE_INFINITY)).toEqual(['done', 'done', 'done']);
    expect(stepStates(3, Number.NEGATIVE_INFINITY)).toEqual(['pending', 'pending', 'pending']);
    expect(stepStates(3, Number.NaN)).toEqual(['pending', 'pending', 'pending']);
  });

  it('counts a fraction as the step it is in', () => {
    expect(stepStates(3, 1.9)).toEqual(['done', 'current', 'pending']);
    expect(stepStates(2.7, 0)).toEqual(['current', 'pending']);
  });

  it('is empty without steps', () => {
    expect(stepStates(0, 0)).toEqual([]);
    expect(stepStates(-2, 0)).toEqual([]);
    expect(stepStates(Number.NaN, 0)).toEqual([]);
  });
});

describe('stepNumber', () => {
  it('counts the step in course from 1', () => {
    expect(stepNumber(4, 0)).toBe(1);
    expect(stepNumber(4, 2)).toBe(3);
    expect(stepNumber(4, 3)).toBe(4);
  });

  it('stays between the first step and the last', () => {
    expect(stepNumber(4, -1)).toBe(1);
    expect(stepNumber(4, 4)).toBe(4);
    expect(stepNumber(4, 99)).toBe(4);
    expect(stepNumber(4, Number.POSITIVE_INFINITY)).toBe(4);
    expect(stepNumber(4, Number.NaN)).toBe(1);
  });

  it('is 0 without steps', () => {
    expect(stepNumber(0, 0)).toBe(0);
    expect(stepNumber(-1, 3)).toBe(0);
  });
});

describe('chunkRows', () => {
  it('puts the items in rows of the size, the last one shorter', () => {
    expect(chunkRows([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(chunkRows([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
    expect(chunkRows([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
    expect(chunkRows([], 2)).toEqual([]);
  });

  it('takes a size below 1, or one that is not a number, as 1', () => {
    expect(chunkRows([1, 2], 0)).toEqual([[1], [2]]);
    expect(chunkRows([1, 2], -3)).toEqual([[1], [2]]);
    expect(chunkRows([1, 2], Number.NaN)).toEqual([[1], [2]]);
    expect(chunkRows([1, 2, 3], 2.9)).toEqual([[1, 2], [3]]);
  });

  it('leaves the items it was given untouched', () => {
    const items = Object.freeze([1, 2, 3]);
    expect(chunkRows(items, 2).flat()).toEqual([1, 2, 3]);
  });
});

describe('badgeText', () => {
  it('shows nothing without a count', () => {
    expect(badgeText(undefined)).toBeUndefined();
    expect(badgeText(null)).toBeUndefined();
    expect(badgeText('')).toBeUndefined();
    expect(badgeText('  ')).toBeUndefined();
    expect(badgeText(0)).toBeUndefined();
    expect(badgeText('0')).toBeUndefined();
    expect(badgeText(-3)).toBeUndefined();
    expect(badgeText(0.4)).toBeUndefined();
    expect(badgeText(Number.NaN)).toBeUndefined();
  });

  it('shows the count, and "99+" past the most it writes', () => {
    expect(badgeText(1)).toBe('1');
    expect(badgeText(99)).toBe('99');
    expect(badgeText(100)).toBe('99+');
    expect(badgeText('12')).toBe('12');
    expect(badgeText('250')).toBe('99+');
    expect(badgeText(12, 9)).toBe('9+');
    expect(badgeText(3.8)).toBe('3');
  });

  it('shows a text that is not a number as it is', () => {
    expect(badgeText('!')).toBe('!');
    expect(badgeText(' nuevo ')).toBe('nuevo');
  });
});

describe('barAboveKeyboard', () => {
  it('is the bar past the bottom inset it keeps behind the keyboard', () => {
    // A phone with a home indicator (34) and the 4.7-inch iPhone SE (no inset).
    expect(barAboveKeyboard(106, 34)).toBe(72);
    expect(barAboveKeyboard(80, 0)).toBe(80);
  });

  it('is 0 before the bar measures itself and never below 0', () => {
    expect(barAboveKeyboard(0, 34)).toBe(0);
    expect(barAboveKeyboard(20, 34)).toBe(0);
    expect(barAboveKeyboard(Number.NaN, 34)).toBe(0);
    expect(barAboveKeyboard(80, Number.NaN)).toBe(80);
    expect(barAboveKeyboard(80, -5)).toBe(80);
  });
});
