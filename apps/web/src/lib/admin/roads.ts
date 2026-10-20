import 'server-only';

import type { Tables } from '@transport/shared';

import type { Supabase } from '../viewer';

// Reads of /admin/carreteras (H4): the whole road catalog as the admin sees
// it (archived rows included, RLS), straight from the tables so every toll
// row (also future and past ones) and every risk can be edited.

export type AdminSegment = Tables<'road_segments'> & {
  tolls: Tables<'road_segment_tolls'>[];
  risks: Tables<'road_segment_risks'>[];
};

export type AdminCorridor = Tables<'road_corridors'> & { segmentCodes: string[] };

function check<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`Admin ${what} query failed: ${result.error.message}`);
  return result.data as T;
}

export async function listRoadCatalog(
  supabase: Supabase,
): Promise<{ segments: AdminSegment[]; corridors: AdminCorridor[] }> {
  const [segments, tolls, risks, corridors, links] = await Promise.all([
    supabase.from('road_segments').select('*').order('code'),
    supabase
      .from('road_segment_tolls')
      .select('*')
      .order('vehicle_class')
      .order('valid_from', { ascending: false }),
    supabase.from('road_segment_risks').select('*').order('from_hour'),
    supabase.from('road_corridors').select('*').order('code'),
    supabase.from('road_corridor_segments').select('corridor_id, seq, segment_id').order('seq'),
  ]);
  const segmentRows = check(segments, 'road segments');
  const tollRows = check(tolls, 'road tolls');
  const riskRows = check(risks, 'road risks');
  const codeById = new Map(segmentRows.map((s) => [s.id, s.code]));
  const linkRows = check(links, 'road corridor segments');
  return {
    segments: segmentRows.map((s) => ({
      ...s,
      tolls: tollRows.filter((t) => t.segment_id === s.id),
      risks: riskRows.filter((r) => r.segment_id === s.id),
    })),
    corridors: check(corridors, 'road corridors').map((c) => ({
      ...c,
      segmentCodes: linkRows
        .filter((l) => l.corridor_id === c.id)
        .map((l) => codeById.get(l.segment_id) ?? '?'),
    })),
  };
}
