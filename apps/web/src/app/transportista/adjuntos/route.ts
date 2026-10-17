import type { NextRequest } from 'next/server';

import { chatAttachmentRedirect } from '@/lib/chat/attachment-route';

/** Chat attachments of the carrier area (G10a). */
export async function GET(request: NextRequest) {
  return chatAttachmentRedirect(request);
}
