import { describe, expect, it } from 'vitest';

import { freightInvoiceFailureLabels, freightInvoicesCopy } from '../copy/freight-invoices';
import {
  CFDI_XML_MAX_BYTES,
  cfdiAmountCents,
  cfdiRfc,
  looksLikePdf,
  parseCfdi,
  type CfdiParseResult,
} from './cfdi';
import { SYNTHETIC_UUID, syntheticCfdi } from './cfdi-fixtures';
import {
  freightInvoiceUploadErrors,
  isFreightInvoiceFailure,
  normalizeFulmisSetting,
  parseFulmisSettings,
  shortCfdiUuid,
} from './invoices';

function issues(result: CfdiParseResult) {
  return result.ok ? [] : result.issues;
}

describe('parseCfdi', () => {
  it('reads the fields the platform checks from a stamped CFDI 4.0', () => {
    expect(parseCfdi(syntheticCfdi())).toEqual({
      ok: true,
      cfdi: {
        uuid: SYNTHETIC_UUID,
        issuerRfc: 'FLI040404CD4',
        issuerName: 'FLETES DE PRUEBA',
        receiverRfc: 'FUL201015AB1',
        receiverName: 'RECEPTOR DE PRUEBA',
        totalCents: 970_000,
        currency: 'MXN',
        issuedAt: '2026-11-06T10:00:00',
      },
    });
  });

  it('matches by namespace, not by prefix', () => {
    const result = parseCfdi(syntheticCfdi({ cfdiPrefix: 'x', tfdPrefix: 'timbre' }));
    expect(result.ok && result.cfdi.uuid).toBe(SYNTHETIC_UUID);
    // The right local names in another namespace are not a CFDI.
    const foreign = syntheticCfdi().replace(
      'http://www.sat.gob.mx/cfd/4',
      'http://example.test/cfd',
    );
    expect(issues(parseCfdi(foreign))).toEqual(['not_cfdi']);
  });

  it('normalizes the UUID and the RFCs and decodes entities', () => {
    const xml = syntheticCfdi({
      uuid: SYNTHETIC_UUID.toUpperCase(),
      issuerRfc: ' fli040404cd4 ',
      issuerName: 'FLETES &amp; CARGA &#x41;',
    });
    const result = parseCfdi(xml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cfdi.uuid).toBe(SYNTHETIC_UUID);
    expect(result.cfdi.issuerRfc).toBe('FLI040404CD4');
    expect(result.cfdi.issuerName).toBe('FLETES & CARGA A');
  });

  it('accepts an RFC with Ñ and &, a BOM and comments', () => {
    const xml = `${String.fromCharCode(0xfeff)}${syntheticCfdi({
      issuerRfc: 'ÑA&040404CD4',
    }).replace('<cfdi:Conceptos>', '<!-- comentario --><cfdi:Conceptos>')}`;
    const result = parseCfdi(xml);
    expect(result.ok && result.cfdi.issuerRfc).toBe('ÑA&040404CD4');
  });

  it('says every reason a CFDI is not one the platform takes', () => {
    expect(
      issues(
        parseCfdi(
          syntheticCfdi({
            version: '3.3',
            type: 'E',
            currency: 'USD',
            total: 'mil',
            issuerRfc: 'NO-RFC',
            receiverRfc: '',
            issuedAt: '2026-02-30T10:00:00',
            unstamped: true,
          }),
        ),
      ),
    ).toEqual([
      'version',
      'type',
      'currency',
      'total',
      'issuer_rfc',
      'receiver_rfc',
      'issued_at',
      'uuid',
    ]);
    expect(issues(parseCfdi(syntheticCfdi({ uuid: 'not-a-uuid' })))).toEqual(['uuid']);
    expect(issues(parseCfdi(syntheticCfdi({ total: '0.00' })))).toEqual(['total']);
    expect(issues(parseCfdi(syntheticCfdi({ issuedAt: '2026-11-06' })))).toEqual(['issued_at']);
  });

  it('rejects a DTD or entity declaration before parsing (XXE, billion laughs)', () => {
    const xxe = `<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>${syntheticCfdi().replace(
      '<?xml version="1.0" encoding="UTF-8"?>',
      '',
    )}`;
    expect(issues(parseCfdi(xxe))).toEqual(['dtd']);
    expect(issues(parseCfdi('<!doctype x><x/>'))).toEqual(['dtd']);
    expect(issues(parseCfdi(syntheticCfdi({ issuerName: '&xxe;' })))).toEqual(['malformed']);
  });

  it('rejects what is not well formed', () => {
    for (const xml of [
      '',
      'texto',
      '<a>',
      '<a></b>',
      '<a/><b/>',
      '<a x="1" x="2"/>',
      '<a x=1/>',
      '<a x="<"/>',
      '<p:a/>',
      '<a/>basura',
      '<a>&#0;</a>',
      syntheticCfdi().replace('</cfdi:Comprobante>', ''),
    ]) {
      expect(issues(parseCfdi(xml)), xml).toEqual(['malformed']);
    }
    // A duplicated issuer or stamp is ambiguous.
    const twoIssuers = syntheticCfdi().replace(
      '<cfdi:Receptor',
      '<cfdi:Emisor Rfc="AAA010101AAA"/><cfdi:Receptor',
    );
    expect(issues(parseCfdi(twoIssuers))).toEqual(['malformed']);
  });

  it('bounds the size and the depth', () => {
    expect(issues(parseCfdi(`<a>${'x'.repeat(CFDI_XML_MAX_BYTES)}</a>`))).toEqual(['too_large']);
    // Multibyte characters count by their UTF-8 bytes.
    expect(issues(parseCfdi(`<a>${'ñ'.repeat(CFDI_XML_MAX_BYTES / 2)}</a>`))).toEqual([
      'too_large',
    ]);
    const deep = `${'<a>'.repeat(65)}${'</a>'.repeat(65)}`;
    expect(issues(parseCfdi(deep))).toEqual(['malformed']);
    const wide = `<a>${'<b/>'.repeat(20_001)}</a>`;
    expect(issues(parseCfdi(wide))).toEqual(['malformed']);
  });

  it('ignores the stamp outside the Complemento of the root', () => {
    const misplaced = syntheticCfdi().replace(
      /<cfdi:Complemento>(.*)<\/cfdi:Complemento>/su,
      '<cfdi:Addenda>$1</cfdi:Addenda>',
    );
    expect(issues(parseCfdi(misplaced))).toEqual(['uuid']);
  });
});

describe('cfdiAmountCents', () => {
  it.each([
    ['9700', 970_000],
    ['9700.5', 970_050],
    ['9700.00', 970_000],
    ['9700.004999', 970_000],
    ['9700.005', 970_001],
    ['0.01', 1],
    [' 12.34 ', 1234],
  ])('%s → %i cents (half up)', (value, cents) => {
    expect(cfdiAmountCents(value)).toBe(cents);
  });

  it.each(['', '-1', '1.2345678', '1e3', '1,000.00', 'abc'])('rejects %j', (value) => {
    expect(cfdiAmountCents(value)).toBeNull();
  });
});

describe('cfdiRfc and looksLikePdf', () => {
  it('normalizes and validates RFCs', () => {
    expect(cfdiRfc('trn120210lp5')).toBe('TRN120210LP5');
    expect(cfdiRfc('SAMJ800417TD3')).toBe('SAMJ800417TD3');
    expect(cfdiRfc('TRN1202')).toBeNull();
    expect(cfdiRfc(undefined)).toBeNull();
  });

  it('recognizes the PDF signature', () => {
    expect(looksLikePdf(new TextEncoder().encode('%PDF-1.7\n'))).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode('<?xml'))).toBe(false);
    expect(looksLikePdf(new Uint8Array())).toBe(false);
  });
});

describe('Fulmis fiscal data', () => {
  it('normalizes each setting as Postgres saves it', () => {
    expect(normalizeFulmisSetting('rfc', ' ful-201015 ab1 ')).toBe('FUL201015AB1');
    expect(normalizeFulmisSetting('rfc', 'FUL2010')).toBeNull();
    expect(normalizeFulmisSetting('legalName', '  Fulmis, S.A.P.I. de C.V. ')).toBe(
      'Fulmis, S.A.P.I. de C.V.',
    );
    expect(normalizeFulmisSetting('legalName', ' ')).toBeNull();
    expect(normalizeFulmisSetting('legalName', 'x'.repeat(301))).toBeNull();
    expect(normalizeFulmisSetting('taxRegime', '601')).toBe('601');
    expect(normalizeFulmisSetting('taxRegime', '60')).toBeNull();
    expect(normalizeFulmisSetting('zip', '64000')).toBe('64000');
    expect(normalizeFulmisSetting('zip', '6400')).toBeNull();
  });

  it('reads the settings rows; null or malformed values are not set', () => {
    expect(
      parseFulmisSettings([
        { key: 'fulmis.rfc', value: 'FUL201015AB1' },
        { key: 'fulmis.legal_name', value: 'Fulmis' },
        { key: 'fulmis.tax_regime', value: 601 },
        { key: 'fulmis.zip', value: null },
      ]),
    ).toEqual({ rfc: 'FUL201015AB1', legalName: 'Fulmis', taxRegime: null, zip: null });
    expect(parseFulmisSettings([])).toEqual({
      rfc: null,
      legalName: null,
      taxRegime: null,
      zip: null,
    });
  });
});

describe('freightInvoiceUploadErrors', () => {
  it('lists each failed rule of an invalid CFDI once', () => {
    expect(
      freightInvoiceUploadErrors(422, {
        error: 'invalid_cfdi',
        failures: ['receiver_mismatch', 'total_mismatch', 'receiver_mismatch', 'unknown'],
      }),
    ).toEqual([
      freightInvoiceFailureLabels.receiver_mismatch,
      freightInvoiceFailureLabels.total_mismatch,
    ]);
    expect(freightInvoiceUploadErrors(413, { failures: ['too_large'] })).toEqual([
      freightInvoiceFailureLabels.too_large,
    ]);
  });

  it('gives one general line otherwise', () => {
    const e = freightInvoicesCopy.errors;
    expect(freightInvoiceUploadErrors(429, {})).toEqual([e.rateLimited]);
    expect(freightInvoiceUploadErrors(404, null)).toEqual([e.notAllowed]);
    expect(freightInvoiceUploadErrors(422, { failures: [] })).toEqual([e.generic]);
    expect(freightInvoiceUploadErrors(null, undefined)).toEqual([e.generic]);
  });

  it('knows the failure codes and shortens UUIDs', () => {
    expect(isFreightInvoiceFailure('uuid_taken')).toBe(true);
    expect(isFreightInvoiceFailure('toString')).toBe(false);
    expect(shortCfdiUuid(SYNTHETIC_UUID)).toBe('6F3A1B2C');
  });
});
