import { sharedDocumentsCopy } from '@transport/shared';
import { NextResponse, type NextRequest } from 'next/server';

import { supabaseEnv } from '@/lib/env';
import { parseShareId, signedDocumentUrl } from '@/lib/shared-documents/links';
import { createClient } from '@/lib/supabase/server';

const c = sharedDocumentsCopy.client;

function unavailable(status: number, message: string = c.unavailable) {
  return new NextResponse(message, {
    status,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

/**
 * A carrier's document shared with the shipper of a trip (G6, D21). The
 * shipper has no Storage access to `documents`: the Edge Function
 * `shared-document-url`, called with the user's session, checks the share,
 * logs the view and signs the file for 60 seconds; this route redirects there.
 */
export async function GET(request: NextRequest) {
  const shareId = parseShareId(request.nextUrl.searchParams.get('id'));
  const env = supabaseEnv();
  const supabase = await createClient();
  if (!shareId || !env || !supabase) return unavailable(404);

  const { data, error } = await supabase.functions.invoke<{ signedPath?: unknown }>(
    'shared-document-url',
    { body: { shareId } },
  );
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status;
    return status === 429 ? unavailable(429, c.rateLimited) : unavailable(404);
  }
  const url = signedDocumentUrl(env.url, data?.signedPath);
  if (!url) return unavailable(404);

  const response = NextResponse.redirect(url);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
