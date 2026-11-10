import 'server-only';

import {
  parseFulmisSettings,
  toCents,
  type FreightInvoiceDirection,
  type FreightInvoiceValidation,
  type FulmisFiscalData,
} from '@transport/shared';

import type { Supabase } from '../viewer';

// Freight invoices (I5, D37). freight_invoices is read with the caller's
// session: RLS gives the client only Fulmis' CFDI of its trips, the carrier
// staff only their CFDI to Fulmis of the trips they operate, and the admin
// both. The files are signed by the download route of each area.

export interface FreightInvoice {
  id: string;
  tripId: string;
  direction: FreightInvoiceDirection;
  cfdiUuid: string;
  totalCents: number;
  issuedAt: string;
  validation: FreightInvoiceValidation;
  hasPdf: boolean;
}

const PAGE = 1000;
const COLUMNS = 'id, trip_id, direction, cfdi_uuid, total_cents, issued_at, validation, pdf_path';

/**
 * The invoices the caller can read, by trip, in one direction (or both for
 * the admin, keyed `${tripId}:${direction}`). Paged by id, so none is missed
 * past the PostgREST cap.
 */
export async function loadFreightInvoices(
  supabase: Supabase,
  direction?: FreightInvoiceDirection,
): Promise<Map<string, FreightInvoice>> {
  const invoices = new Map<string, FreightInvoice>();
  let after: string | null = null;
  for (;;) {
    let query = supabase.from('freight_invoices').select(COLUMNS).order('id').limit(PAGE);
    if (direction) query = query.eq('direction', direction);
    if (after) query = query.gt('id', after);
    const { data, error } = await query;
    if (error) throw new Error(`freight_invoices query failed: ${error.message}`);
    for (const row of data) {
      const invoice: FreightInvoice = {
        id: row.id,
        tripId: row.trip_id,
        direction: row.direction,
        cfdiUuid: row.cfdi_uuid,
        totalCents: toCents(row.total_cents),
        issuedAt: row.issued_at,
        validation: row.validation,
        hasPdf: row.pdf_path !== null,
      };
      invoices.set(direction ? row.trip_id : invoiceKey(row.trip_id, row.direction), invoice);
    }
    if (data.length < PAGE) return invoices;
    after = data.at(-1)?.id ?? null;
  }
}

/** The key of an invoice in the admin's map (both directions). */
export function invoiceKey(tripId: string, direction: FreightInvoiceDirection): string {
  return `${tripId}:${direction}`;
}

/** Fulmis' fiscal data (I5): every signed-in user reads it. Not set while in process. */
export async function loadFulmisFiscalData(supabase: Supabase): Promise<FulmisFiscalData> {
  const { data, error } = await supabase
    .from('platform_settings')
    .select('key, value')
    .like('key', 'fulmis.%');
  if (error) throw new Error(`platform_settings query failed: ${error.message}`);
  return parseFulmisSettings(data);
}
