import { uiCopy } from '@transport/shared';
import { Check } from 'lucide-react';
import type * as React from 'react';

import { cn } from '@/lib/utils';

import { stepLabelVariants, stepMarkVariants, type StepState } from './variants';

export interface Step {
  label: React.ReactNode;
  /** A line under the label: what happens in the step, or what is missing. */
  description?: React.ReactNode;
  /** A short fact on the right: when it happened. */
  meta?: React.ReactNode;
  state: StepState;
}

/**
 * The steps of something that advances (§1.5): the timeline of a trip, a
 * form in parts, the stages of a payment. Done steps carry a check on the
 * neutral surface (no green), the current one the accent and its weight, the
 * ones to come an empty ring. The state is also said in words to a screen
 * reader, and the current step is `aria-current`.
 */
export function Steps({
  steps,
  orientation = 'vertical',
  label,
  className,
}: {
  steps: readonly Step[];
  orientation?: 'vertical' | 'horizontal';
  /** What the steps are of, for a screen reader. */
  label: string;
  className?: string;
}) {
  const horizontal = orientation === 'horizontal';
  return (
    <ol
      aria-label={label}
      className={cn(horizontal ? 'flex items-start gap-3' : 'flex flex-col', className)}
    >
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        const mark = (
          <span className={stepMarkVariants({ state: step.state })}>
            {step.state === 'done' ? <Check aria-hidden /> : <span aria-hidden>{index + 1}</span>}
          </span>
        );
        const words = (
          <>
            <span className={stepLabelVariants({ state: step.state })}>
              {step.label}
              <span className="sr-only"> ({uiCopy.steps[step.state]})</span>
            </span>
            {step.description && (
              <span className="block text-footnote text-text-dim">{step.description}</span>
            )}
          </>
        );
        if (horizontal) {
          return (
            <li
              key={index}
              aria-current={step.state === 'current' ? 'step' : undefined}
              className={cn('flex min-w-0 items-start gap-3', !last && 'flex-1')}
            >
              <span className="flex min-w-0 flex-col gap-2">
                {mark}
                <span className="min-w-0">{words}</span>
              </span>
              {!last && <span aria-hidden className="mt-3 h-px min-w-4 flex-1 bg-separator" />}
            </li>
          );
        }
        return (
          <li
            key={index}
            aria-current={step.state === 'current' ? 'step' : undefined}
            className="flex gap-3"
          >
            <span className="flex flex-col items-center">
              {mark}
              {!last && <span aria-hidden className="my-1 w-px flex-1 bg-separator" />}
            </span>
            <span className={cn('flex min-w-0 flex-1 items-start gap-4', !last && 'pb-5')}>
              <span className="min-w-0 flex-1 pt-0.5">{words}</span>
              {step.meta && (
                <span className="shrink-0 pt-1 text-meta text-text-dim">{step.meta}</span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
