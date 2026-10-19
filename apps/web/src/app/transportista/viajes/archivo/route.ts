import type { NextRequest } from 'next/server';

import { tripFileRedirect } from '@/lib/trips/file-route';

/** Evidence photos and trip documents of the carrier area (G10b). */
export async function GET(request: NextRequest) {
  return tripFileRedirect(request);
}
