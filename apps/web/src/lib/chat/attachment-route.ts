import 'server-only';

import { CHAT_ATTACHMENT_PATH, chatCopy } from '@transport/shared';
import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '../supabase/server';

/** Signed URLs live just long enough to open the file. */
const SIGNED_URL_SECONDS = 60;

/**
 * Chat attachment viewer (`?ruta={conversation_id}/{file}`), shared by the
 * shipper and the carrier areas (each one mounts it under its own prefix, so
 * the routing rules of the area guard it): redirects to a short-lived signed
 * URL of the file in the private `chat` bucket. The bucket policy only lets
 * participants of the conversation (and admins) read it, so another user
 * gets a 404. The path goes in the query string so the proxy, which skips
 * URLs ending in an image extension, still guards this route.
 */
export async function chatAttachmentRedirect(request: NextRequest): Promise<NextResponse> {
  const path = request.nextUrl.searchParams.get('ruta') ?? '';
  const supabase = await createClient();
  if (!supabase || !CHAT_ATTACHMENT_PATH.test(path)) {
    return new NextResponse(chatCopy.errors.unavailable, { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from('chat')
    .createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) return new NextResponse(chatCopy.errors.unavailable, { status: 404 });

  const response = NextResponse.redirect(data.signedUrl);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
