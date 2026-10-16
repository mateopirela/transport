import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

// Scripts of the mobile Maestro flows (apps/mobile/.maestro/scripts, F14).
// Maestro runs them as plain scripts with an `output` global; here they run
// the same way, with a fixed clock.
const ESTIMATE = readFileSync(
  fileURLToPath(new URL('../../apps/mobile/.maestro/scripts/unload-estimate.js', import.meta.url)),
  'utf8',
);

interface Estimate {
  input: string;
  shown: string;
}

function estimateAt(utc: string): Estimate {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(utc));
  const output: { estimate?: Estimate } = {};
  new Function('output', ESTIMATE)(output);
  if (!output.estimate) throw new Error('the script set no estimate');
  return output.estimate;
}

/** Whether the flow's assertion matches what the app shows. */
function matches(shown: string, text: string): boolean {
  return new RegExp(`^Fin estimado: .*, ${shown}$`, 'u').test(text);
}

describe('unload-estimate.js', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is 3 hours from now in Mexico City time (UTC-6)', () => {
    // 18:15 UTC = 12:15 in Mexico City.
    const estimate = estimateAt('2026-10-16T18:15:00Z');
    expect(estimate.input).toBe('15:15');
    expect(matches(estimate.shown, 'Fin estimado: 16 oct 2026, 15:15')).toBe(true);
  });

  it('pads the hour it types and accepts it shown with or without the zero', () => {
    // 11:30 UTC = 05:30 in Mexico City -> 08:30.
    const estimate = estimateAt('2026-10-16T11:30:00Z');
    expect(estimate.input).toBe('08:30');
    expect(matches(estimate.shown, 'Fin estimado: 16 oct 2026, 08:30')).toBe(true);
    expect(matches(estimate.shown, 'Fin estimado: 16 oct 2026, 8:30')).toBe(true);
    expect(matches(estimate.shown, 'Fin estimado: 16 oct 2026, 18:30')).toBe(false);
  });

  it('starts from midnight in Mexico City', () => {
    // 06:00 UTC = 00:00 in Mexico City -> 03:00.
    expect(estimateAt('2026-10-16T06:00:00Z').input).toBe('03:00');
  });

  it('stays today: never later than 23:59', () => {
    // 04:00 UTC = 22:00 in Mexico City; +3 h would be tomorrow 01:00.
    const estimate = estimateAt('2026-10-17T04:00:00Z');
    expect(estimate.input).toBe('23:59');
    expect(matches(estimate.shown, 'Fin estimado: 16 oct 2026, 23:59')).toBe(true);
  });
});
