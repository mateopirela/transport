import {
  dwellCopy,
  formatDistance,
  formatMxn,
  formatTime,
  riskWarningText,
  roadsCopy,
  tollClassLabels,
  tollsAmount,
  type DwellEstimate,
  type RoadSuggestion,
} from '@transport/shared';

import { Cell, Footnote, Group, Notice, SectionHeader, TextCell, ValueRow } from './ui';

/**
 * "Ruta sugerida" of a load (H4, D31) in the app: the corridor, the estimated
 * tolls for the unit's class with their source and date, the warnings of
 * unsafe segments at the hour the truck passes, and the segments in order.
 * H5: the typical waiting and loading time at the pickup, when known.
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
    <TextCell icon="time">{dwellCopy.pickup(pickupDwell)}</TextCell>
  ) : null;
  if (road.source === 'none') {
    return (
      <>
        <SectionHeader title={roadsCopy.section} />
        <Group>
          <Cell title={roadsCopy.none} subtitle={roadsCopy.noneHint} />
          {dwell}
        </Group>
      </>
    );
  }
  return (
    <>
      <SectionHeader title={roadsCopy.section} />
      {road.usesAvoided ? <Notice tone="warning">{roadsCopy.usesAvoided}</Notice> : null}
      <Group>
        <ValueRow label={roadsCopy.tolls} value={tollsAmount(road)} strong />
        <Cell
          title={road.corridor.name}
          subtitle={`${roadsCopy.tollClass(tollClassLabels[road.tollClass])} · ${roadsCopy.distance(
            formatDistance(road.distanceKm),
          )}`}
        />
        {road.warnings.map((w) => (
          <TextCell key={`${w.segmentId}-${w.fromHour}-${w.level}`} icon="warning">
            {`${riskWarningText(w)} · ${roadsCopy.segmentPass(formatTime(w.passAt))}`}
          </TextCell>
        ))}
        {road.warnings.length === 0 ? <TextCell tone="dim">{roadsCopy.noRisks}</TextCell> : null}
        {dwell}
      </Group>
      {road.tollSources.map((s) => (
        <Footnote key={`${s.source}|${s.validFrom}|${s.dataStatus}`}>
          {roadsCopy.source(s.dataStatus, s.source, s.validFrom)}
        </Footnote>
      ))}
      <Footnote>{estimateFor}</Footnote>
      {road.tollsMissing ? <Footnote>{roadsCopy.tollsMissing}</Footnote> : null}
      <Group>
        {road.segments.map((s) => (
          <Cell
            key={s.id}
            title={s.highway ? `${s.name} · ${s.highway}` : s.name}
            subtitle={[
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
            pill={
              s.preference
                ? {
                    label: s.preference === 'avoid' ? roadsCopy.avoided : roadsCopy.preferred,
                    tone: s.preference === 'avoid' ? 'amber' : 'ok',
                  }
                : undefined
            }
          />
        ))}
      </Group>
    </>
  );
}
