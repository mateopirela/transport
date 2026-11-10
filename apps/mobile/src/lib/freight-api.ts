import {
  CFDI_PDF_MAX_BYTES,
  CFDI_XML_MAX_BYTES,
  compareFreightOrder,
  fetchFreightPages,
  FREIGHT_INVOICE_FUNCTIONS,
  FREIGHT_PAGE_SIZE,
  freightInvoiceUploadErrors,
  isQuickPayBlocker,
  parseFreightPayments,
  parseFulmisSettings,
  quickPayErrorText,
  toCents,
  type Database,
  type FreightInvoiceFailure,
  type FreightInvoiceValidation,
  type FreightPayment,
  type FulmisFiscalData,
  type QuickPayBlocker,
} from '@transport/shared';

import type { Supabase } from './supabase';

// "Cobranza" in the app (I3, D34-E1): what Fulmis pays the carrier for each
// trip. carrier_freight_ledger returns only the carrier's columns (freight,
// commission, net, its date, its status and its own payments): the Gerente
// gets the whole company, a Coordinador their business units and an operator
// nothing.

type Row = Database['public']['Functions']['carrier_freight_ledger']['Returns'][number];

export type CollectionRow = Omit<
  Row,
  | 'payments'
  | 'freight_cents'
  | 'commission_cents'
  | 'net_cents'
  | 'paid_cents'
  | 'pending_cents'
  | 'quick_pay_fee_cents'
  | 'quick_pay_net_cents'
  | 'quick_pay_blocker'
> & {
  freight_cents: number;
  commission_cents: number;
  net_cents: number;
  paid_cents: number;
  pending_cents: number;
  payments: FreightPayment[];
  /** Quick pay (I4): the frozen fee and what Fulmis pays, once requested. */
  quick_pay_fee_cents: number | null;
  quick_pay_net_cents: number | null;
  /** Why the quick pay cannot be asked for; null when it can. */
  quick_pay_blocker: QuickPayBlocker | null;
};

function nullableCents(value: number | string | null | undefined): number | null {
  return value === null || value === undefined ? null : toCents(value);
}

/**
 * Every trip of the carrier, in pages by ledger id (the totals need all of
 * them, never the first 1,000), in the order of the RPC.
 */
export async function loadCollections(client: Supabase): Promise<CollectionRow[]> {
  const data = await fetchFreightPages<Row>((after) => {
    const query = client.rpc('carrier_freight_ledger');
    return (after ? query.gt('ledger_id', after) : query)
      .order('ledger_id')
      .limit(FREIGHT_PAGE_SIZE);
  }, 'carrier_freight_ledger');
  data.sort((a, b) =>
    compareFreightOrder(
      { dueOn: a.due_on, tripCreatedAt: a.trip_created_at, ledgerId: a.ledger_id },
      { dueOn: b.due_on, tripCreatedAt: b.trip_created_at, ledgerId: b.ledger_id },
    ),
  );
  return data.map((row) => ({
    ...row,
    freight_cents: toCents(row.freight_cents),
    commission_cents: toCents(row.commission_cents),
    net_cents: toCents(row.net_cents),
    paid_cents: toCents(row.paid_cents),
    pending_cents: toCents(row.pending_cents),
    payments: parseFreightPayments(row.payments),
    quick_pay_fee_cents: nullableCents(row.quick_pay_fee_cents),
    quick_pay_net_cents: nullableCents(row.quick_pay_net_cents),
    quick_pay_blocker: isQuickPayBlocker(row.quick_pay_blocker) ? row.quick_pay_blocker : null,
  }));
}

/**
 * The current quick pay fee (I4) for the carrier staff, to show the quick
 * net before asking; null when it cannot be read (then no request is offered).
 */
export async function loadQuickPayFee(client: Supabase): Promise<number | null> {
  const { data, error } = await client.rpc('carrier_quick_pay_fee_bps');
  if (error) return null;
  return typeof data === 'number' ? data : null;
}

export type QuickPayRequestResult = { ok: true } | { ok: false; error: string };

/**
 * Asks for the quick pay of a trip (request_quick_pay) with the fee the
 * carrier was shown: Postgres refuses it if the fee changed meanwhile.
 */
export async function requestQuickPay(
  client: Supabase,
  tripId: string,
  feeBps: number,
): Promise<QuickPayRequestResult> {
  const { error } = await client.rpc('request_quick_pay', {
    p_trip_id: tripId,
    p_fee_bps: feeBps,
  });
  return error ? { ok: false, error: quickPayErrorText(error) } : { ok: true };
}

/** The carrier's CFDI to Fulmis of a trip (I5), as Cobranza shows it. */
export interface CarrierInvoice {
  cfdiUuid: string;
  issuedAt: string;
  validation: FreightInvoiceValidation;
}

const INVOICE_PAGE = 1000;

/**
 * The carrier's CFDI to Fulmis by trip (I5). RLS gives the Gerente the whole
 * company and a Coordinador their business units; paged by id.
 */
export async function loadCarrierInvoices(client: Supabase): Promise<Map<string, CarrierInvoice>> {
  const invoices = new Map<string, CarrierInvoice>();
  let after: string | null = null;
  for (;;) {
    let query = client
      .from('freight_invoices')
      .select('id, trip_id, cfdi_uuid, issued_at, validation')
      .eq('direction', 'carrier_to_fulmis')
      .order('id')
      .limit(INVOICE_PAGE);
    if (after) query = query.gt('id', after);
    const { data, error } = await query;
    if (error) throw new Error(`freight_invoices query failed: ${error.message}`);
    for (const row of data) {
      invoices.set(row.trip_id, {
        cfdiUuid: row.cfdi_uuid,
        issuedAt: row.issued_at,
        validation: row.validation,
      });
    }
    if (data.length < INVOICE_PAGE) return invoices;
    after = data.at(-1)?.id ?? null;
  }
}

/** Fulmis' fiscal data (I5): who the carrier invoices. Not set while in process. */
export async function loadFulmisData(client: Supabase): Promise<FulmisFiscalData> {
  const { data, error } = await client
    .from('platform_settings')
    .select('key, value')
    .like('key', 'fulmis.%');
  if (error) throw new Error(`platform_settings query failed: ${error.message}`);
  return parseFulmisSettings(data);
}

/** A file picked on the phone, as React Native's FormData sends it. */
export interface PickedInvoiceFile {
  uri: string;
  name: string;
  type: string;
}

export type CfdiUploadResult =
  { ok: true; validation: FreightInvoiceValidation } | { ok: false; errors: string[] };

/**
 * Sends the carrier's CFDI of a trip (the XML and, optionally, the PDF) to the
 * Edge Function validate-carrier-cfdi with the user's session. The function
 * validates it and says every rule that failed.
 */
export async function uploadCarrierCfdi(
  client: Supabase,
  tripId: string,
  files: { xml: PickedInvoiceFile; pdf: PickedInvoiceFile | null },
): Promise<CfdiUploadResult> {
  const body = new FormData();
  body.append('tripId', tripId);
  // React Native's FormData takes { uri, name, type } for a file.
  body.append('xml', files.xml as unknown as Blob);
  if (files.pdf) body.append('pdf', files.pdf as unknown as Blob);
  const { data, error } = await client.functions.invoke<{ validation?: string }>(
    FREIGHT_INVOICE_FUNCTIONS.carrier_to_fulmis,
    { body },
  );
  if (error) {
    const context = (error as { context?: unknown }).context;
    const response = context instanceof Response ? context : null;
    const answer: unknown = response ? await response.json().catch(() => null) : null;
    return { ok: false, errors: freightInvoiceUploadErrors(response?.status ?? null, answer) };
  }
  return { ok: true, validation: data?.validation === 'validated' ? 'validated' : 'unvalidated' };
}

export type CfdiPick =
  | { status: 'picked'; xml: PickedInvoiceFile; pdf: PickedInvoiceFile | null }
  | { status: 'invalid'; failure: FreightInvoiceFailure };

/**
 * The XML and the optional PDF among the files picked at once (the document
 * picker's assets): the first of each kind, by type or extension, within the
 * size limits of the Edge Function.
 */
export function classifyCfdiFiles(
  assets: readonly { uri: string; name: string; mimeType?: string | null; size?: number | null }[],
): CfdiPick {
  const kindOf = (asset: { name: string; mimeType?: string | null }) => {
    const name = asset.name.toLowerCase();
    const type = (asset.mimeType ?? '').toLowerCase();
    if (name.endsWith('.xml') || type.endsWith('/xml')) return 'xml';
    if (name.endsWith('.pdf') || type === 'application/pdf') return 'pdf';
    return null;
  };
  const xml = assets.find((asset) => kindOf(asset) === 'xml');
  const pdf = assets.find((asset) => kindOf(asset) === 'pdf');
  if (!xml) return { status: 'invalid', failure: 'xml_missing' };
  if ((xml.size ?? 0) > CFDI_XML_MAX_BYTES) return { status: 'invalid', failure: 'too_large' };
  if (pdf && (pdf.size ?? 0) > CFDI_PDF_MAX_BYTES) {
    return { status: 'invalid', failure: 'pdf_too_large' };
  }
  return {
    status: 'picked',
    xml: { uri: xml.uri, name: xml.name, type: 'application/xml' },
    pdf: pdf ? { uri: pdf.uri, name: pdf.name, type: 'application/pdf' } : null,
  };
}
