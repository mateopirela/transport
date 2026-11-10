import 'server-only';

import { freightInvoicesCopy } from '@transport/shared';
import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '../supabase/server';
import { invoiceFileName, parseInvoiceFileRequest } from './invoice-links';

/** How long the signed URL of an invoice file lasts. */
const SIGNED_SECONDS = 60;

function unavailable(status: number) {
  return new NextResponse(freightInvoicesCopy.downloadUnavailable, {
    status,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

/**
 * GET ?id=<invoice>&archivo=pdf|xml (I5): one file of a freight invoice, as a
 * 60-second signed URL of the private `invoices` bucket. The invoice is read
 * with the caller's session (RLS: each side only its own direction) and the
 * file is signed with it too (the bucket's policy only lets a registered
 * invoice the caller can read be signed), so nobody downloads the other
 * side's invoice.
 */
export async function invoiceDownload(request: NextRequest): Promise<NextResponse> {
  const parsed = parseInvoiceFileRequest(request.nextUrl.searchParams);
  const supabase = await createClient();
  if (!parsed || !supabase) return unavailable(404);

  const { data, error } = await supabase
    .from('freight_invoices')
    .select('cfdi_uuid, xml_path, pdf_path')
    .eq('id', parsed.invoiceId)
    .maybeSingle();
  if (error || !data) return unavailable(404);
  const path = parsed.kind === 'pdf' ? data.pdf_path : data.xml_path;
  if (!path) return unavailable(404);

  const signed = await supabase.storage.from('invoices').createSignedUrl(path, SIGNED_SECONDS, {
    download: invoiceFileName(data.cfdi_uuid, parsed.kind),
  });
  if (signed.error || !signed.data?.signedUrl) return unavailable(404);

  const response = NextResponse.redirect(signed.data.signedUrl);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
