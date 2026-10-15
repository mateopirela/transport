import { describe, expect, expectTypeOf, it } from 'vitest';

import { Constants } from './db';
import type { Database, Enums, Tables } from './index';

type Functions = Database['public']['Functions'];

// Guards the generated types (pnpm db:types) against drifting from the
// verification schema of B03 (supabase/migrations/*_documents_verification.sql).
describe('generated database types (B03)', () => {
  it('exposes the verification enums', () => {
    expect(Constants.public.Enums.document_owner_type).toEqual(['company', 'vehicle', 'operator']);
    expect(Constants.public.Enums.taxpayer_type).toEqual(['moral', 'fisica']);
  });

  it('types documents, requirements and the audit log', () => {
    expectTypeOf<Tables<'documents'>['status']>().toEqualTypeOf<Enums<'verification_status'>>();
    expectTypeOf<Tables<'documents'>['owner_type']>().toEqualTypeOf<Enums<'document_owner_type'>>();
    expectTypeOf<Tables<'documents'>['expires_at']>().toEqualTypeOf<string | null>();
    expectTypeOf<
      Tables<'document_requirements'>['company_type']
    >().toEqualTypeOf<Enums<'company_type'> | null>();
    expectTypeOf<Tables<'audit_log'>['actor_id']>().toEqualTypeOf<string | null>();
  });

  it('types the verification RPCs', () => {
    expectTypeOf<Functions['submit_document']['Returns']>().toEqualTypeOf<string>();
    expectTypeOf<Functions['review_document']['Returns']>().toEqualTypeOf<
      Enums<'verification_status'>
    >();
    expectTypeOf<Functions['review_company']['Returns']>().toEqualTypeOf<
      Enums<'verification_status'>
    >();
  });
});
