'use client';

import {
  roadPreferenceLabels,
  roadsCopy,
  ROAD_PREFERENCES,
  type RoadPreference,
} from '@transport/shared';
import { useActionState, useId } from 'react';

import { Button } from '@/components/ui/button';
import { ErrorText, Field, fieldHelpId } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { Select } from '@/components/ui/select';
import { groupRow } from '@/components/ui/variants';
import { setRoadPreference } from '@/lib/carrier/road-actions';

const c = roadsCopy.preferences;

export interface RouteSegmentOption {
  id: string;
  name: string;
  highway: string | null;
}

/** A segment of the catalog marked on the route, with "Quitar". */
function MarkedSegment({ routeId, segment }: { routeId: string; segment: RouteSegmentOption }) {
  const [state, action, pending] = useActionState(setRoadPreference, {});
  return (
    <li className={`${groupRow} flex flex-wrap items-center justify-between gap-2 px-4 py-2.5`}>
      <span className="text-subhead text-text">
        {segment.name}
        {segment.highway ? ` · ${segment.highway}` : ''}
      </span>
      <form action={action}>
        <input type="hidden" name="routeId" value={routeId} />
        <input type="hidden" name="segmentId" value={segment.id} />
        <input type="hidden" name="preference" value="clear" />
        <Button
          type="submit"
          variant="plain"
          size="sm"
          loading={pending}
          aria-label={`${c.remove}: ${segment.name}`}
        >
          {c.remove}
        </Button>
      </form>
      {state.error && <ErrorText className="w-full">{state.error}</ErrorText>}
    </li>
  );
}

/**
 * Preferred and avoided segments of one usual route (H4, D31): the two lists
 * and a form to mark a segment of the catalog's corridors that serve the
 * route. The suggested route of the loads on this route follows them.
 */
export function RoadPreferences({
  routeId,
  title,
  segments,
  marked,
}: {
  routeId: string;
  title: string;
  /** Segments of the corridors that serve the route. */
  segments: readonly RouteSegmentOption[];
  /** Segment id → preference on this route. */
  marked: Readonly<Record<string, RoadPreference>>;
}) {
  const id = useId();
  const [state, action, pending] = useActionState(setRoadPreference, {});
  const errors = state.fieldErrors ?? {};
  const byPreference = (preference: RoadPreference) =>
    segments.filter((s) => marked[s.id] === preference);
  const free = segments.filter((s) => !marked[s.id]);

  return (
    <section className="space-y-3 rounded-2xl border bg-cell p-5" aria-label={title}>
      <h3 className="text-headline text-text">{title}</h3>
      {segments.length === 0 ? (
        <p className="text-subhead text-text-dim">{c.noCatalog}</p>
      ) : (
        <>
          {ROAD_PREFERENCES.map((preference) => {
            const list = byPreference(preference);
            return (
              <div key={preference} className="space-y-1.5">
                <p className="px-1 text-label text-text-dim">
                  {preference === 'prefer' ? c.preferredTitle : c.avoidedTitle}
                </p>
                {list.length === 0 ? (
                  <p className="px-1 text-subhead text-text-faint">{c.empty}</p>
                ) : (
                  <ul className="overflow-hidden rounded-xl border">
                    {list.map((segment) => (
                      <MarkedSegment key={segment.id} routeId={routeId} segment={segment} />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
          {free.length > 0 && (
            <form action={action} className="space-y-3 border-t pt-3" noValidate>
              {state.error && <Notice tone="error">{state.error}</Notice>}
              {state.message && <Notice tone="success">{state.message}</Notice>}
              <input type="hidden" name="routeId" value={routeId} />
              <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
                <Field label={c.segmentLabel} htmlFor={`${id}-segment`} error={errors.segmentId}>
                  <Select
                    id={`${id}-segment`}
                    name="segmentId"
                    defaultValue=""
                    aria-invalid={errors.segmentId ? true : undefined}
                    aria-describedby={errors.segmentId ? fieldHelpId(`${id}-segment`) : undefined}
                  >
                    <option value="" disabled />
                    {free.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {s.highway ? ` · ${s.highway}` : ''}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={c.kindLabel} htmlFor={`${id}-preference`}>
                  <Select id={`${id}-preference`} name="preference" defaultValue="avoid">
                    {ROAD_PREFERENCES.map((p) => (
                      <option key={p} value={p}>
                        {roadPreferenceLabels[p]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Button type="submit" variant="secondary" size="sm" loading={pending}>
                {c.save}
              </Button>
            </form>
          )}
          <p className="text-footnote text-text-dim">{c.hint}</p>
        </>
      )}
    </section>
  );
}
