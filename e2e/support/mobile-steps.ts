/**
 * Which steps of scripts/e2e-mobile.mjs (the Maestro flows and what the
 * script does between them) a run goes through. Pure, so Vitest covers it;
 * the script imports this file directly (Node strips the types).
 *
 * `needs` names the step that sets up what a step expects. It always comes
 * earlier in the run, and it can need another step in turn.
 */
export interface MobileStep {
  name: string;
  needs?: string;
}

export interface StepSelection {
  /** Start at this step and run everything after it (--from). */
  from?: string | undefined;
  /** Run only these steps, in the order of the run (--only). */
  only?: readonly string[] | undefined;
  /**
   * The seed is reset first (the default). On a fresh seed a step is run
   * after its whole chain of `needs`; with --no-reset the data from an
   * earlier run is kept, so only the step's own `needs` runs again, as
   * before: going further back would repeat setup that is already there
   * (another load with the same description, another offer).
   */
  reset: boolean;
}

function indexOf(steps: readonly MobileStep[], name: string): number {
  const at = steps.findIndex((step) => step.name === name);
  if (at < 0) {
    throw new Error(`unknown step ${name}: ${steps.map((step) => step.name).join(', ')}`);
  }
  return at;
}

/** The step that `steps[at]` needs, which must come before it. */
function neededBy(steps: readonly MobileStep[], at: number): number | null {
  const step = steps[at];
  if (!step?.needs) return null;
  const before = indexOf(steps, step.needs);
  if (before >= at) throw new Error(`${step.name} needs a later step: ${step.needs}`);
  return before;
}

/** The first step to run for `steps[at]`: its whole chain of `needs`, or only its own one. */
export function firstStepFor(steps: readonly MobileStep[], at: number, chain: boolean): number {
  let first = at;
  for (let before = neededBy(steps, first); before !== null; before = neededBy(steps, first)) {
    first = before;
    if (!chain) break;
  }
  return first;
}

/** The steps a run goes through, in the order of the run. */
export function selectSteps<T extends MobileStep>(
  steps: readonly T[],
  { from, only, reset }: StepSelection,
): T[] {
  if (from !== undefined && only !== undefined) throw new Error('use --from or --only, not both');
  if (only !== undefined) {
    if (only.length === 0) throw new Error('--only needs a comma-separated list of steps');
    const wanted = new Set<number>();
    for (const name of only) {
      const at = indexOf(steps, name);
      for (let i = firstStepFor(steps, at, reset); i <= at; i += 1) wanted.add(i);
    }
    return steps.filter((_, i) => wanted.has(i));
  }
  if (from === undefined) return [...steps];
  return steps.slice(firstStepFor(steps, indexOf(steps, from), reset));
}
