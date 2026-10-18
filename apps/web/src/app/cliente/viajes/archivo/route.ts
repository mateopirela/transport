import type { NextRequest } from 'next/server';

import { tripFileRedirect } from '@/lib/trips/file-route';

/** Evidence photos and trip documents of the shipper area (B15). */
export async function GET(request: NextRequest) {
  return tripFileRedirect(request);
}
