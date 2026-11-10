import { describe, expect, it } from 'vitest';

import { invoiceFileHref, invoiceFileName, parseInvoiceFileRequest } from './invoice-links';

const ID = '6f3a1b2c-4d5e-4f60-8a7b-9c0d1e2f3a4b';

describe('invoice download links', () => {
  it('points each area to its own route', () => {
    expect(invoiceFileHref('shipper', ID, 'pdf')).toBe(
      `/cliente/cartera/factura?id=${ID}&archivo=pdf`,
    );
    expect(invoiceFileHref('carrier', ID, 'xml')).toBe(
      `/transportista/cobranza/factura?id=${ID}&archivo=xml`,
    );
    expect(invoiceFileHref('admin', ID, 'pdf')).toBe(`/admin/flete/factura?id=${ID}&archivo=pdf`);
  });

  it('parses the request back and refuses anything else', () => {
    const href = invoiceFileHref('carrier', ID, 'xml');
    expect(parseInvoiceFileRequest(new URL(href, 'http://web.test').searchParams)).toEqual({
      invoiceId: ID,
      kind: 'xml',
    });
    expect(parseInvoiceFileRequest(new URLSearchParams({ id: 'x', archivo: 'pdf' }))).toBeNull();
    expect(parseInvoiceFileRequest(new URLSearchParams({ id: ID, archivo: 'zip' }))).toBeNull();
    expect(parseInvoiceFileRequest(new URLSearchParams({ id: ID }))).toBeNull();
  });

  it('names the file by the short folio fiscal', () => {
    expect(invoiceFileName(ID, 'pdf')).toBe('CFDI-6F3A1B2C.pdf');
    expect(invoiceFileName(ID, 'xml')).toBe('CFDI-6F3A1B2C.xml');
  });
});
