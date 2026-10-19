import { describe, expect, expectTypeOf, it } from 'vitest';

import type { Database, Tables } from './index';
import { TRIP_DOCUMENT_KINDS, tripDocumentKindLabels } from './index';

type Functions = Database['public']['Functions'];

// Guards the generated types (pnpm db:types) against drifting from the B15
// schema (supabase/migrations/*_client_trip_tracking.sql) and the G3 trip
// document requirements (D22).
describe('generated database types (B15, G3)', () => {
  it('types trip_documents', () => {
    expectTypeOf<Tables<'trip_documents'>['kind']>().toEqualTypeOf<
      'service_order' | 'carta_porte' | 'invoice' | 'other'
    >();
    expectTypeOf<Tables<'trip_documents'>['storage_path']>().toEqualTypeOf<string>();
  });

  it('types the trip document requirements and the checklist (G3)', () => {
    expectTypeOf<Tables<'trip_document_requirements'>['stage']>().toEqualTypeOf<
      'before_departure' | 'billing'
    >();
    expectTypeOf<Tables<'trip_document_requirements'>['uploader_sides']>().toEqualTypeOf<
      ('shipper' | 'carrier')[]
    >();
    expectTypeOf<Tables<'license_unit_compatibility'>['license_type']>().toEqualTypeOf<
      'B' | 'C' | 'E'
    >();
    expectTypeOf<Functions['trip_checklist']['Args']>().toEqualTypeOf<{ p_trip_id: string }>();
    // The generator cannot see that done_at is null while pending; TripChecklistRow widens it.
    expectTypeOf<Functions['trip_checklist']['Returns'][number]>().toEqualTypeOf<{
      code: string;
      stage: string;
      responsible: string;
      required: boolean;
      done_at: string;
    }>();
  });

  it('types the B15 RPCs', () => {
    expectTypeOf<Functions['shipper_trip_parties']['Args']>().toEqualTypeOf<{
      p_trip_ids: string[];
    }>();
    expectTypeOf<Functions['add_trip_document']['Returns']>().toEqualTypeOf<string>();
  });

  it('labels every trip document kind in Spanish', () => {
    expect(TRIP_DOCUMENT_KINDS.map((kind) => tripDocumentKindLabels[kind])).toEqual([
      'Orden de servicio',
      'CFDI con complemento Carta Porte',
      'Factura',
      'Otro documento',
    ]);
  });
});
