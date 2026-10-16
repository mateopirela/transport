import { describe, expect, expectTypeOf, it } from 'vitest';

import type { Database, Tables } from './index';
import { TRIP_DOCUMENT_KINDS, tripDocumentKindLabels } from './index';

type Functions = Database['public']['Functions'];

// Guards the generated types (pnpm db:types) against drifting from the B15
// schema (supabase/migrations/*_client_trip_tracking.sql).
describe('generated database types (B15)', () => {
  it('types trip_documents', () => {
    expectTypeOf<Tables<'trip_documents'>['kind']>().toEqualTypeOf<'carta_porte' | 'other'>();
    expectTypeOf<Tables<'trip_documents'>['storage_path']>().toEqualTypeOf<string>();
  });

  it('types the B15 RPCs', () => {
    expectTypeOf<Functions['shipper_trip_parties']['Args']>().toEqualTypeOf<{
      p_trip_ids: string[];
    }>();
    expectTypeOf<Functions['add_trip_document']['Returns']>().toEqualTypeOf<string>();
  });

  it('labels every trip document kind in Spanish', () => {
    expect(TRIP_DOCUMENT_KINDS.map((kind) => tripDocumentKindLabels[kind])).toEqual([
      'Carta Porte',
      'Otro documento',
    ]);
  });
});
