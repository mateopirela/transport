import {
  dwellCopy,
  formatDistance,
  formatMxn,
  formatTime,
  riskWarningText,
  roadsCopy,
  tollClassLabels,
  tollsText,
  type DwellEstimate,
  type RoadSuggestion,
} from '@transport/shared';
import { TriangleAlert } from 'lucide-react';

import { PageSection } from '@/components/page-section';
import { Notice } from '@/components/ui/notice';
import { Pill } from '@/components/ui/pill';
import { groupRow } from '@/components/ui/variants';

/**
 * "Ruta sugerida" of a load (H4, D31): the corridor of the road catalog, the
 * estimated tolls for the unit's class with their source and date, the
 * warnings of unsafe segments at the hour the truck passes, and the segments
 * in order. Without a corridor for the pair it says so. H5: the typical
 * waiting and loading time at the pickup, when known.
 */
export function SuggestedRoute({
  road,
  estimateFor,
  pickupDwell,
}: {
  road: RoadSuggestion;
  /** Which truck the tolls were estimated for (roadsCopy.estimateFor). */
  estimateFor: string;
  pickupDwell?: DwellEstimate | null;
}) {
  const dwell = pickupDwell ? (
    <p className="px-1 text-subhead text-text-dim tabular-nums">{dwellCopy.pickup(pickupDwell)}</p>
  ) : null;
  if (road.source === 'none') {
    return (
      <PageSection title={roadsCopy.section}>
        <div className="space-y-1 rounded-2xl border bg-cell px-4 py-3">
          <p className="text-headline text-text">{roadsCopy.none}</p>
          <p className="text-subhead text-text-dim">{roadsCopy.noneHint}</p>
        </div>
        {dwell}
      </PageSection>
    );
  }
  return (
    <PageSection title={roadsCopy.section} description={road.corridor.name}>
      {road.usesAvoided && <Notice tone="info">{roadsCopy.usesAvoided}</Notice>}
      <div className="space-y-1 rounded-2xl border bg-cell px-4 py-3">
        <p className="text-headline text-text tabular-nums">{tollsText(road)}</p>
        <p className="text-footnote text-text-dim">
          {roadsCopy.tollClass(tollClassLabels[road.tollClass])} ·{' '}
          {roadsCopy.distance(formatDistance(road.distanceKm))}
        </p>
        {road.tollSources.map((s) => (
          <p
            key={`${s.source}|${s.validFrom}|${s.dataStatus}`}
            className="text-footnote text-text-dim"
          >
            {roadsCopy.source(s.dataStatus, s.source, s.validFrom)}
          </p>
        ))}
        <p className="text-footnote text-text-dim">{estimateFor}</p>
        {road.tollsMissing && (
          <p className="text-footnote text-text-dim">{roadsCopy.tollsMissing}</p>
        )}
      </div>
      {dwell}

      {road.warnings.length > 0 ? (
        <ul className="space-y-2">
          {road.warnings.map((w) => (
            <li
              key={`${w.segmentId}-${w.fromHour}-${w.level}`}
              className="flex gap-2 rounded-2xl bg-amber/14 px-4 py-3 text-subhead text-amber-text"
            >
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                {riskWarningText(w)} · {roadsCopy.segmentPass(formatTime(w.passAt))}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-1 text-subhead text-text-dim">{roadsCopy.noRisks}</p>
      )}

      <ol className="overflow-hidden rounded-2xl border bg-cell">
        {road.segments.map((s) => (
          <li key={s.id} className={`${groupRow} space-y-0.5 px-4 py-3`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-subhead font-semibold text-text">
                {s.name}
                {s.highway ? ` · ${s.highway}` : ''}
              </p>
              {s.preference && (
                <Pill tone={s.preference === 'avoid' ? 'amber' : 'ok'}>
                  {s.preference === 'avoid' ? roadsCopy.avoided : roadsCopy.preferred}
                </Pill>
              )}
            </div>
            <p className="text-footnote text-text-dim tabular-nums">
              {[
                formatDistance(s.distanceKm),
                roadsCopy.segmentPass(formatTime(s.enterAt)),
                s.isToll
                  ? roadsCopy.segmentToll(
                      s.tollCents === null ? roadsCopy.noData : formatMxn(s.tollCents),
                    )
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </li>
        ))}
      </ol>
    </PageSection>
  );
}
