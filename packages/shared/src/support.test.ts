import { describe, expect, it } from 'vitest';

import { supportCopy } from './copy/support';
import {
  isValidSupportHours,
  normalizeSupportWhatsapp,
  parseSupportSettings,
  SUPPORT_HOURS_MAX_LENGTH,
  SUPPORT_SETTING_KEYS,
  supportRoleLabel,
  supportWhatsappUrl,
  tripFolio,
} from './support';

const TRIP_ID = '3f2a1b9c-0000-4000-8000-000000000001';

/** The text of a wa.me link, decoded. */
function textOf(url: string): string {
  return decodeURIComponent(new URL(url).searchParams.get('text') ?? '');
}

describe('parseSupportSettings', () => {
  it('reads the number and the hours', () => {
    expect(
      parseSupportSettings([
        { key: SUPPORT_SETTING_KEYS.whatsapp, value: '+528112345678' },
        { key: SUPPORT_SETTING_KEYS.hours, value: '  Lunes a sábado, 8 a 20 h ' },
        { key: 'billing.pilot_mode', value: true },
      ]),
    ).toEqual({ whatsapp: '+528112345678', hours: 'Lunes a sábado, 8 a 20 h' });
  });

  it('treats missing, null or malformed values as not set', () => {
    expect(parseSupportSettings([])).toEqual({ whatsapp: null, hours: null });
    expect(
      parseSupportSettings([
        { key: SUPPORT_SETTING_KEYS.whatsapp, value: null },
        { key: SUPPORT_SETTING_KEYS.hours, value: null },
      ]),
    ).toEqual({ whatsapp: null, hours: null });
    expect(
      parseSupportSettings([
        { key: SUPPORT_SETTING_KEYS.whatsapp, value: '8112345678' },
        { key: SUPPORT_SETTING_KEYS.hours, value: '   ' },
      ]),
    ).toEqual({ whatsapp: null, hours: null });
    expect(
      parseSupportSettings([{ key: SUPPORT_SETTING_KEYS.whatsapp, value: 528112345678 }]),
    ).toEqual({ whatsapp: null, hours: null });
  });
});

describe('normalizeSupportWhatsapp', () => {
  it('accepts Mexican numbers as people type them and E.164 from other countries', () => {
    expect(normalizeSupportWhatsapp('81 1234 5678')).toBe('+528112345678');
    expect(normalizeSupportWhatsapp('+52 1 (81) 1234-5678')).toBe('+528112345678');
    expect(normalizeSupportWhatsapp('+1 512 555 0100')).toBe('+15125550100');
  });

  it('refuses what is not a phone', () => {
    expect(normalizeSupportWhatsapp('')).toBeNull();
    expect(normalizeSupportWhatsapp('12345')).toBeNull();
    expect(normalizeSupportWhatsapp('wa.me/528112345678')).toBeNull();
    expect(normalizeSupportWhatsapp(null)).toBeNull();
  });
});

describe('isValidSupportHours', () => {
  it('takes 1 to 200 characters after trimming', () => {
    expect(isValidSupportHours('Lunes a viernes')).toBe(true);
    expect(isValidSupportHours('   ')).toBe(false);
    expect(isValidSupportHours('a'.repeat(SUPPORT_HOURS_MAX_LENGTH))).toBe(true);
    expect(isValidSupportHours(` ${'a'.repeat(SUPPORT_HOURS_MAX_LENGTH)} `)).toBe(true);
    expect(isValidSupportHours('a'.repeat(SUPPORT_HOURS_MAX_LENGTH + 1))).toBe(false);
  });
});

describe('supportRoleLabel', () => {
  it('says the role, and "Hombre camión" for a Gerente who drives', () => {
    expect(supportRoleLabel('manager')).toBe('Gerente');
    expect(supportRoleLabel('manager', true)).toBe('Hombre camión');
    expect(supportRoleLabel('coordinator', true)).toBe('Coordinador');
    expect(supportRoleLabel('operator')).toBe('Operador');
    expect(supportRoleLabel('shipper')).toBe('Cliente');
    expect(supportRoleLabel(null)).toBeNull();
  });
});

describe('tripFolio', () => {
  it('is the first 8 characters of the id in capitals', () => {
    expect(tripFolio(TRIP_ID)).toBe('3F2A1B9C');
    expect(tripFolio(TRIP_ID.toUpperCase())).toBe('3F2A1B9C');
  });

  it('is null for anything that is not a trip id', () => {
    expect(tripFolio(null)).toBeNull();
    expect(tripFolio(undefined)).toBeNull();
    expect(tripFolio('nuevo')).toBeNull();
    expect(tripFolio('3f2a1b9c')).toBeNull();
  });
});

describe('supportWhatsappUrl', () => {
  it('opens wa.me with the digits and a message with the role', () => {
    const url = supportWhatsappUrl({ whatsapp: '+528112345678', roleLabel: 'Gerente' });
    expect(url).not.toBeNull();
    expect(url?.startsWith('https://wa.me/528112345678?text=')).toBe(true);
    expect(textOf(url as string)).toBe(supportCopy.message('Gerente', null));
    expect(textOf(url as string)).toContain('Soy Gerente.');
    expect(textOf(url as string)).not.toContain('Viaje');
  });

  it('adds the folio inside a trip', () => {
    const url = supportWhatsappUrl({
      whatsapp: '+528112345678',
      roleLabel: 'Operador',
      tripId: TRIP_ID,
    });
    expect(textOf(url as string)).toBe(
      'Hola, necesito ayuda con la plataforma de transporte. Soy Operador. Viaje 3F2A1B9C.',
    );
  });

  it('encodes the message so accents and spaces survive', () => {
    const url = supportWhatsappUrl({ whatsapp: '+528112345678', roleLabel: 'Hombre camión' });
    expect(url).toContain('Hombre%20cami%C3%B3n');
    expect(url).not.toContain(' ');
  });

  it('leaves out the role when it is unknown and ignores a bad trip id', () => {
    const url = supportWhatsappUrl({ whatsapp: '+528112345678', roleLabel: null, tripId: 'x' });
    expect(textOf(url as string)).toBe('Hola, necesito ayuda con la plataforma de transporte.');
  });

  it('is null without a valid number: "Ayuda" does not show', () => {
    expect(supportWhatsappUrl({ whatsapp: null, roleLabel: 'Gerente' })).toBeNull();
    expect(supportWhatsappUrl({ whatsapp: '', roleLabel: 'Gerente' })).toBeNull();
    expect(supportWhatsappUrl({ whatsapp: '8112345678', roleLabel: 'Gerente' })).toBeNull();
  });
});
