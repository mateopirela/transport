import 'server-only';

import { uuidField } from '@transport/shared';
import { NextResponse } from 'next/server';

import type { Supabase } from '../viewer';

/** Signed URLs live just long enough to open the file. */
const SIGNED_URL_SECONDS = 60;

/**
 * Redirects to a short-lived signed URL of a document's file in the private
 * `documents` bucket, or answers 404 with `unavailable`. The row and the
 * object are read through RLS and the Storage policies: an admin sees any,
 * the company's staff only its own (and a Coordinador only those of their
 * business units, G1a). The caller checks the role of its area first.
 */
export async function documentFileRedirect(
  supabase: Supabase,
  documentId: string,
  unavailable: string,
): Promise<NextResponse> {
  if (!uuidField.safeParse(documentId).success) {
    return new NextResponse(unavailable, { status: 404 });
  }
  const { data: document } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('id', documentId)
    .maybeSingle();
  if (!document) return new NextResponse(unavailable, { status: 404 });

  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(document.storage_path, SIGNED_URL_SECONDS);
  if (error) return new NextResponse(unavailable, { status: 404 });

  const response = NextResponse.redirect(data.signedUrl);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
