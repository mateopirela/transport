import type { NextRequest } from 'next/server';

import { invoiceDownload } from '@/lib/freight/invoice-download';

/** The carrier staff download their CFDI to Fulmis (I5). RLS decides which invoice; see invoiceDownload. */
export function GET(request: NextRequest) {
  return invoiceDownload(request);
}
