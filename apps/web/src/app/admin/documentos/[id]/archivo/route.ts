import { adminCopy, uuidField } from '@transport/shared';
import { NextResponse } from 'next/server';

import { getViewer } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

/** Signed URLs live just long enough to open the file. */
const SIGNED_URL_SECONDS = 60;

/**
 * Document viewer for admins: redirects to a short-lived signed URL of the
 * file in the private `documents` bucket. The row and the object are read
 * through RLS and the Storage policies, which only let admins (or the owning
 * company) see them; the explicit role check keeps this route admin-only.
 */
export async function GET(_request: Request, ctx: RouteContext<'/admin/documentos/[id]/archivo'>) {
  const { id } = await ctx.params;
  const viewer = await getViewer();
  if (viewer?.role !== 'admin') {
    return new NextResponse(adminCopy.errors.forbidden, { status: 403 });
  }
  const supabase = await createClient();
  if (!supabase || !uuidField.safeParse(id).success) {
    return new NextResponse(adminCopy.errors.fileUnavailable, { status: 404 });
  }

  const { data: document } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('id', id)
    .maybeSingle();
  if (!document) return new NextResponse(adminCopy.errors.fileUnavailable, { status: 404 });

  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(document.storage_path, SIGNED_URL_SECONDS);
  if (error) return new NextResponse(adminCopy.errors.fileUnavailable, { status: 404 });

  const response = NextResponse.redirect(data.signedUrl);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
