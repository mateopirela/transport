import type { NextRequest } from 'next/server';

import { invoiceDownload } from '@/lib/freight/invoice-download';

/** The admin downloads both CFDI of every trip (I5). RLS decides which invoice; see invoiceDownload. */
export function GET(request: NextRequest) {
  return invoiceDownload(request);
}
