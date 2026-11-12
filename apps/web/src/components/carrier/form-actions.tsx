import type * as React from 'react';

/**
 * The buttons at the foot of a long form of the fleet, in the cell (`p-5`)
 * that holds it: they stay at the bottom of the window while the form
 * scrolls, so its primary is always in view (docs/plan-fulmis.md §0.4). A
 * hairline over them; no shadow.
 */
export function StickyFormActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-5 -mb-5 flex flex-wrap items-center gap-2 border-t bg-cell px-5 py-3">
      {children}
    </div>
  );
}
