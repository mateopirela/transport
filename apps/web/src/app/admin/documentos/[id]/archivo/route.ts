import { adminCopy } from '@transport/shared';
import { NextResponse } from 'next/server';

import { getViewer } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { documentFileRedirect } from '@/lib/verification/document-file';

/**
 * Document viewer for admins: redirects to a short-lived signed URL of the
 * file in the private `documents` bucket. The row and the object are read
 * through RLS and the Storage policies, which only let admins with the
 * second factor (or the owning company) see them; the explicit check keeps
 * this route for admins in aal2 (R5, D46).
 */
export async function GET(_request: Request, ctx: RouteContext<'/admin/documentos/[id]/archivo'>) {
  const { id } = await ctx.params;
  const viewer = await getViewer();
  if (viewer?.role !== 'admin' || viewer.aal !== 'aal2') {
    return new NextResponse(adminCopy.errors.forbidden, { status: 403 });
  }
  const supabase = await createClient();
  if (!supabase) return new NextResponse(adminCopy.errors.fileUnavailable, { status: 404 });
  return documentFileRedirect(supabase, id, adminCopy.errors.fileUnavailable);
}
