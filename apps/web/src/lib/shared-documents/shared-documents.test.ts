import { describe, expect, it } from 'vitest';

import { parseShareId, sharedDocumentHref, signedDocumentUrl } from './links';

const SHARE = '00000000-0000-4000-8000-000000000001';
const SIGNED = `/storage/v1/object/sign/documents/c/company/c/${SHARE}.pdf?token=abc.def`;

describe('shared document links', () => {
  it('keeps the share id in the query string of the shipper route', () => {
    expect(sharedDocumentHref(SHARE)).toBe(`/cliente/viajes/documento-compartido?id=${SHARE}`);
    expect(parseShareId(SHARE)).toBe(SHARE);
    expect(parseShareId('../x')).toBeNull();
    expect(parseShareId(null)).toBeNull();
  });

  it('joins the signed path to the Supabase URL', () => {
    expect(signedDocumentUrl('http://127.0.0.1:54321', SIGNED)).toBe(
      `http://127.0.0.1:54321${SIGNED}`,
    );
    expect(signedDocumentUrl('https://ref.supabase.co/', SIGNED)).toBe(
      `https://ref.supabase.co${SIGNED}`,
    );
  });

  it('never redirects outside the documents bucket of that host', () => {
    for (const path of [
      'https://evil.test/storage/v1/object/sign/documents/x?token=a',
      '//evil.test/storage/v1/object/sign/documents/x?token=a',
      '/storage/v1/object/sign/evidence/x?token=a',
      '/storage/v1/object/public/documents/x',
      '/storage/v1/object/sign/documents/x',
      `${SIGNED}#frag`,
      42,
      null,
    ]) {
      expect(signedDocumentUrl('http://127.0.0.1:54321', path)).toBeNull();
    }
    expect(signedDocumentUrl('javascript:alert(1)', SIGNED)).toBeNull();
    expect(signedDocumentUrl('not a url', SIGNED)).toBeNull();
  });
});
