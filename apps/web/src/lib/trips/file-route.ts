import 'server-only';

import { clientTripsCopy } from '@transport/shared';
import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '../supabase/server';
import { parseTripFile } from './tracking';

/** Signed URLs live just long enough to open the file. */
const SIGNED_URL_SECONDS = 60;

/**
 * Trip file viewer (`?tipo=evidencia|documentos&ruta={trip_id}/...`), shared
 * by the shipper (B15) and the carrier (G10b) areas, each one mounting it
 * under its own prefix so the routing rules of the area guard it: redirects
 * to a short-lived signed URL of an evidence photo or a trip document. The
 * bucket policies only let the parties of the trip (and admins) read them,
 * so anyone else gets a 404. The path goes in the query string so the proxy,
 * which skips URLs ending in a file extension, still guards this route.
 */
export async function tripFileRedirect(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const file = parseTripFile(params.get('tipo'), params.get('ruta'));
  const supabase = await createClient();
  if (!supabase || !file) {
    return new NextResponse(clientTripsCopy.errors.fileUnavailable, { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from(file.bucket)
    .createSignedUrl(file.path, SIGNED_URL_SECONDS);
  if (error) return new NextResponse(clientTripsCopy.errors.fileUnavailable, { status: 404 });

  const response = NextResponse.redirect(data.signedUrl);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
