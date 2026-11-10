// Download links of the freight invoices (I5). Each area has its own route
// (the proxy and the layouts already guard /cliente, /transportista and
// /admin); RLS decides which invoice the caller may get. Pure, so the routes,
// the pages and the tests share one definition.
import { shortCfdiUuid, uuidField } from '@transport/shared';

export type InvoiceArea = 'shipper' | 'carrier' | 'admin';
export type InvoiceFileKind = 'pdf' | 'xml';

const ROUTES: Record<InvoiceArea, string> = {
  shipper: '/cliente/cartera/factura',
  carrier: '/transportista/cobranza/factura',
  admin: '/admin/flete/factura',
};

/** The route that signs and redirects to one file of an invoice. */
export function invoiceFileHref(
  area: InvoiceArea,
  invoiceId: string,
  kind: InvoiceFileKind,
): string {
  return `${ROUTES[area]}?id=${encodeURIComponent(invoiceId)}&archivo=${kind}`;
}

/** The invoice id and the file kind of a download request, or null when malformed. */
export function parseInvoiceFileRequest(
  params: URLSearchParams,
): { invoiceId: string; kind: InvoiceFileKind } | null {
  const id = uuidField.safeParse(params.get('id'));
  const kind = params.get('archivo');
  if (!id.success || (kind !== 'pdf' && kind !== 'xml')) return null;
  return { invoiceId: id.data, kind };
}

/** The name the browser saves the file with: `CFDI-6F3A1B2C.pdf`. */
export function invoiceFileName(cfdiUuid: string, kind: InvoiceFileKind): string {
  return `CFDI-${shortCfdiUuid(cfdiUuid)}.${kind}`;
}
