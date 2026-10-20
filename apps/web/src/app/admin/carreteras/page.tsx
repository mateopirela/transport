import {
  formatCalendarDate,
  formatDistance,
  formatMxn,
  hourBandLabel,
  roadDataStatusLabels,
  roadRiskLevelLabels,
  roadsCopy,
  todayInMexicoCity,
  tollClassLabels,
} from '@transport/shared';
import type { Metadata } from 'next';

import {
  ArchiveRiskForm,
  CorridorForm,
  RiskForm,
  SegmentForm,
  TollForm,
} from '@/components/admin/road-forms';
import { PageSection, textLink } from '@/components/page-section';
import { Empty } from '@/components/ui/empty';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import { groupRow } from '@/components/ui/variants';
import { adminContext } from '@/lib/admin/queries';
import { listRoadCatalog, type AdminCorridor, type AdminSegment } from '@/lib/admin/roads';
import { paths } from '@/lib/routing';

const c = roadsCopy.admin;

export const metadata: Metadata = { title: c.title };

const str = (value: number | string | null | undefined) =>
  value === null || value === undefined ? '' : String(value);

function segmentValues(s: AdminSegment): Record<string, string> {
  return {
    id: s.id,
    code: s.code,
    name: s.name,
    highway: str(s.highway),
    fromCity: s.from_city,
    fromState: s.from_state,
    fromLat: str(s.from_lat),
    fromLng: str(s.from_lng),
    toCity: s.to_city,
    toState: s.to_state,
    toLat: str(s.to_lat),
    toLng: str(s.to_lng),
    distanceKm: str(s.distance_km),
    isToll: s.is_toll ? 'on' : 'off',
    notes: str(s.notes),
    source: s.source,
    sourceUrl: str(s.source_url),
    sourceDate: s.source_date,
    dataStatus: s.data_status,
    archived: s.archived_at ? 'on' : 'off',
  };
}

function corridorValues(k: AdminCorridor): Record<string, string> {
  return {
    id: k.id,
    code: k.code,
    name: k.name,
    originCity: k.origin_city,
    originState: k.origin_state,
    originLat: str(k.origin_lat),
    originLng: str(k.origin_lng),
    originRadiusKm: str(k.origin_radius_km),
    destinationCity: k.destination_city,
    destinationState: k.destination_state,
    destinationLat: str(k.destination_lat),
    destinationLng: str(k.destination_lng),
    destinationRadiusKm: str(k.destination_radius_km),
    bidirectional: k.bidirectional ? 'on' : 'off',
    segmentCodes: k.segmentCodes.join(', '),
    archived: k.archived_at ? 'on' : 'off',
  };
}

/** A source with its link (when there is one) and date. */
function Source({ source, url, date }: { source: string; url: string | null; date: string }) {
  return (
    <span className="text-footnote text-text-dim">
      {url ? (
        <a href={url} className={textLink} target="_blank" rel="noreferrer">
          {source}
        </a>
      ) : (
        source
      )}
      {`, ${formatCalendarDate(date)}`}
    </span>
  );
}

/**
 * Road catalog for admins (H4, D31): corridors, segments, tolls per truck
 * class and insecurity by hour band, every figure with its source and date.
 * Every change goes through the admin RPCs and lands in the audit log.
 */
export default async function AdminRoadsPage() {
  const supabase = await adminContext(paths.adminRoads);
  const { segments, corridors } = await listRoadCatalog(supabase);
  const today = todayInMexicoCity();

  return (
    <>
      <PageHeader title={c.title} description={c.description} />

      <div className="space-y-10">
        <PageSection title={c.corridors}>
          {corridors.length === 0 ? (
            <Empty title={c.empty} />
          ) : (
            <ul className="overflow-hidden rounded-2xl border bg-cell">
              {corridors.map((k) => (
                <li key={k.id} className={`${groupRow} space-y-2 px-4 py-4`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-headline text-text">{k.name}</p>
                    <Pill>{k.code}</Pill>
                    {k.archived_at && <Pill tone="amber">{c.archived}</Pill>}
                  </div>
                  <p className="text-subhead text-text-dim">{k.segmentCodes.join(' → ')}</p>
                  <CorridorForm initial={corridorValues(k)} summary={c.form.editCorridor} />
                </li>
              ))}
            </ul>
          )}
          <CorridorForm
            initial={{ originRadiusKm: '60', destinationRadiusKm: '60' }}
            summary={c.form.newCorridor}
          />
        </PageSection>

        <PageSection title={c.segments}>
          {segments.length === 0 ? (
            <Empty title={c.empty} />
          ) : (
            <ul className="space-y-4">
              {segments.map((s) => (
                <li key={s.id} className="space-y-3 rounded-2xl border bg-cell p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-headline text-text">{s.name}</h3>
                    <Pill>{s.code}</Pill>
                    <Pill tone={s.data_status === 'verified' ? 'ok' : 'neutral'}>
                      {roadDataStatusLabels[s.data_status]}
                    </Pill>
                    {s.archived_at && <Pill tone="amber">{c.archived}</Pill>}
                  </div>
                  <p className="text-subhead text-text-dim">
                    {[
                      s.highway,
                      formatDistance(Number(s.distance_km)),
                      `${c.columns.toll}: ${s.is_toll ? c.yes : c.no}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <Source source={s.source} url={s.source_url} date={s.source_date} />

                  <div className="space-y-1.5">
                    <p className="text-label text-text-dim">{c.tollsTitle}</p>
                    {s.tolls.length === 0 ? (
                      <p className="text-subhead text-text-faint">{roadsCopy.noData}</p>
                    ) : (
                      <ul className="overflow-hidden rounded-xl border">
                        {s.tolls.map((t) => (
                          <li
                            key={t.id}
                            className={`${groupRow} flex flex-wrap items-baseline justify-between gap-x-3 px-3 py-2`}
                          >
                            <span className="text-subhead text-text tabular-nums">
                              {tollClassLabels[t.vehicle_class]} ·{' '}
                              {t.amount_cents === null
                                ? roadsCopy.noData
                                : formatMxn(t.amount_cents)}
                            </span>
                            <span className="text-footnote text-text-dim">
                              {c.columns.validFrom} {formatCalendarDate(t.valid_from)} ·{' '}
                              {roadDataStatusLabels[t.data_status]} · {t.source}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <TollForm segmentId={s.id} today={today} />
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-label text-text-dim">{c.risksTitle}</p>
                    {s.risks.length === 0 ? (
                      <p className="text-subhead text-text-faint">{c.noRisks}</p>
                    ) : (
                      <ul className="overflow-hidden rounded-xl border">
                        {s.risks.map((r) => (
                          <li
                            key={r.id}
                            className={`${groupRow} flex flex-wrap items-center justify-between gap-2 px-3 py-2`}
                          >
                            <span className="space-y-0.5">
                              <span className="block text-subhead text-text">
                                {roadRiskLevelLabels[r.level]} ·{' '}
                                {hourBandLabel(r.from_hour, r.to_hour)} · {r.description}
                                {r.archived_at ? ` · ${c.archived}` : ''}
                              </span>
                              <Source source={r.source} url={r.source_url} date={r.observed_on} />
                            </span>
                            {!r.archived_at && (
                              <ArchiveRiskForm
                                risk={{
                                  id: r.id,
                                  segmentId: r.segment_id,
                                  level: r.level,
                                  fromHour: String(r.from_hour),
                                  toHour: String(r.to_hour),
                                  description: r.description,
                                  source: r.source,
                                  ...(r.source_url ? { sourceUrl: r.source_url } : {}),
                                  observedOn: r.observed_on,
                                  dataStatus: r.data_status,
                                }}
                              />
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    <RiskForm segmentId={s.id} today={today} />
                  </div>

                  <SegmentForm initial={segmentValues(s)} summary={c.form.editSegment} />
                </li>
              ))}
            </ul>
          )}
          <SegmentForm initial={{ sourceDate: today, isToll: 'off' }} summary={c.form.newSegment} />
        </PageSection>
      </div>
    </>
  );
}
