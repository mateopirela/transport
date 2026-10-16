import { describe, expect, it } from 'vitest';

import { privacyNotice, termsOfService, type LegalText } from './copy/legal';
import { LEGAL_PATHS, legalUrl } from './legal';

describe('legalUrl', () => {
  it('builds the page URL from the site origin', () => {
    expect(legalUrl('https://app.example.mx', 'privacy')).toBe(
      'https://app.example.mx/aviso-de-privacidad',
    );
    expect(legalUrl(' https://app.example.mx/cliente/ ', 'terms')).toBe(
      'https://app.example.mx/terminos',
    );
    expect(legalUrl('http://127.0.0.1:3000', 'terms')).toBe('http://127.0.0.1:3000/terminos');
  });

  it('hides the link without a usable https site URL', () => {
    for (const site of [
      undefined,
      null,
      '',
      '   ',
      'not a url',
      'http://app.example.mx',
      'http://192.168.1.20:3000',
      'javascript:alert(1)',
      'https://user:pass@app.example.mx',
    ]) {
      expect(legalUrl(site, 'privacy')).toBeNull();
    }
  });

  it('uses distinct public paths', () => {
    expect(new Set(Object.values(LEGAL_PATHS)).size).toBe(Object.keys(LEGAL_PATHS).length);
  });
});

const texts: [string, LegalText][] = [
  ['privacy notice', privacyNotice],
  ['terms', termsOfService],
];

describe.each(texts)('%s', (_, text) => {
  it('is marked as a draft until the legal review fills its placeholders', () => {
    const body = JSON.stringify(text);
    // Placeholders like [RAZÓN SOCIAL DEL RESPONSABLE] are left for the lawyer.
    const hasPlaceholders = /\[[A-ZÁÉÍÓÚÑ ,]+\]/u.test(body);
    expect(text.draft || !hasPlaceholders).toBe(true);
    expect(text.version.trim()).not.toBe('');
  });

  it('has titled, non-empty sections', () => {
    expect(text.sections.length).toBeGreaterThan(3);
    for (const section of text.sections) {
      expect(section.title.trim()).not.toBe('');
      expect(section.paragraphs.length + (section.items?.length ?? 0)).toBeGreaterThan(0);
    }
  });
});

describe('privacy notice (LFPDPPP)', () => {
  const titles = privacyNotice.sections.map((section) => section.title).join(' | ');

  it('covers the elements the law requires', () => {
    for (const required of [
      'Datos personales',
      'Finalidades',
      'compartimos',
      'ARCO',
      'Cookies',
      'Cambios',
    ]) {
      expect(titles).toContain(required);
    }
    expect(privacyNotice.intro).toContain('Ley Federal de Protección de Datos Personales');
  });

  it('describes the location sharing the operator consents to (B22)', () => {
    const location = privacyNotice.sections.find((section) => section.title.includes('Ubicación'));
    expect(location?.paragraphs.join(' ')).toContain('solo durante un viaje activo');
  });
});
