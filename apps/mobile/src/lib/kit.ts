/**
 * The pure logic of the kit (components/ui.tsx): what a row of steps shows
 * for each step, how tiles fall into rows, what a tab's counter reads. No
 * React Native here, so it is tested on its own.
 */
import type { StateTone } from '@transport/shared';

/**
 * The names the screens of the app gave a pill before Fulmis, and the tone
 * (docs/plan-fulmis.md §1.1) each one is now. They keep working until every
 * screen asks for a tone by its own name (V7, V8; V9 deletes the old names).
 */
export const LEGACY_TONES = Object.freeze({
  accent: 'attention',
  ok: 'done',
  amber: 'pending',
  red: 'problem',
  neutral: 'inactive',
} as const satisfies Record<string, StateTone>);

export type LegacyTone = keyof typeof LEGACY_TONES;

function isLegacyTone(tone: string): tone is LegacyTone {
  return Object.hasOwn(LEGACY_TONES, tone);
}

/** A tone by its name, or by the name it had before Fulmis. */
export function toTone(tone: StateTone | LegacyTone): StateTone {
  return isLegacyTone(tone) ? LEGACY_TONES[tone] : tone;
}

export type StepState = 'done' | 'current' | 'pending';

/**
 * The state of each of `count` steps when `current` (0-based) is the one in
 * course: the ones before it are done and the ones after it wait. A `current`
 * below 0 means nothing has started; one at `count` or past it, that every
 * step is done. A fraction counts as the step it is in.
 */
export function stepStates(count: number, current: number): StepState[] {
  const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const at = Number.isFinite(current) ? Math.floor(current) : current > 0 ? total : -1;
  return Array.from({ length: total }, (_, i) =>
    i < at ? 'done' : i === at ? 'current' : 'pending',
  );
}

/**
 * The step to name in "Paso 3 de 4": the one in course, counted from 1 and
 * kept between 1 and `count` (before the first step it is still step 1, after
 * the last one it is the last). 0 when there are no steps.
 */
export function stepNumber(count: number, current: number): number {
  const total = stepStates(count, 0).length;
  if (total === 0) return 0;
  const at = Number.isFinite(current) ? Math.floor(current) : current > 0 ? total : 0;
  return Math.min(Math.max(at + 1, 1), total);
}

/** `items` in rows of `size` (the last one may be shorter). A size below 1 counts as 1. */
export function chunkRows<T>(items: readonly T[], size: number): T[][] {
  const width = Number.isFinite(size) ? Math.max(1, Math.floor(size)) : 1;
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += width) rows.push(items.slice(i, i + width));
  return rows;
}

/**
 * What a tab shows on its counter: nothing for no count (undefined, an empty
 * text, zero or less), the count itself up to `max`, and "99+" past it. A
 * text that is not a number is shown as it is.
 */
export function badgeText(badge: number | string | null | undefined, max = 99): string | undefined {
  if (badge === undefined || badge === null || badge === '') return undefined;
  if (typeof badge === 'string') {
    const trimmed = badge.trim();
    if (trimmed === '') return undefined;
    if (!/^-?\d+$/u.test(trimmed)) return trimmed;
    return badgeText(Number(trimmed), max);
  }
  if (!Number.isFinite(badge) || badge <= 0) return undefined;
  const count = Math.floor(badge);
  if (count <= 0) return undefined;
  return count > max ? `${max}+` : String(count);
}
