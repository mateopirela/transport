import { carrierWebCopy, isCarrierStaff } from '@transport/shared';
import { NextResponse } from 'next/server';

import { getViewer } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { documentFileRedirect } from '@/lib/verification/document-file';

/**
 * Document viewer of the carrier's fleet (G10b): redirects to a short-lived
 * signed URL of a unit's or operator's document. The row and the object are
 * read through RLS and the Storage policies (the company's staff, by
 * business unit); the explicit role check keeps this route for the staff.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<'/transportista/flota/documentos/[id]/archivo'>,
) {
  const { id } = await ctx.params;
  const unavailable = carrierWebCopy.fleet.documents.fileUnavailable;
  const viewer = await getViewer();
  if (!viewer || !isCarrierStaff(viewer.role)) {
    return new NextResponse(unavailable, { status: 403 });
  }
  const supabase = await createClient();
  if (!supabase) return new NextResponse(unavailable, { status: 404 });
  return documentFileRedirect(supabase, id, unavailable);
}
