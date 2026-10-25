import { describe, expect, it } from 'vitest';

import { tripLinkCopy } from './copy/trip-link';
import {
  androidAssetLinks,
  appleAppSiteAssociation,
  canSendTripLink,
  openTripLinkSchema,
  parseTripLink,
  smsUrl,
  tripDeepLink,
  tripLinkDestination,
  tripLinkErrorText,
  tripLinkMessage,
  tripLinkPath,
  tripLinkUrl,
  whatsappPhone,
  whatsappUrl,
} from './trip-link';

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE';
const TRIP_ID = '0b9b1c1e-6a1d-4c1e-9a43-5d3c1f4f2a10';

describe('trip link builders', () => {
  it('builds the web URL on https only (http on loopback)', () => {
    expect(TOKEN).toHaveLength(43);
    expect(tripLinkPath(TOKEN)).toBe(`/viaje/${TOKEN}`);
    expect(tripLinkUrl('https://transport.mx/', TOKEN)).toBe(`https://transport.mx/viaje/${TOKEN}`);
    expect(tripLinkUrl('http://127.0.0.1:3000', TOKEN)).toBe(
      `http://127.0.0.1:3000/viaje/${TOKEN}`,
    );
    expect(tripLinkUrl('http://transport.mx', TOKEN)).toBeNull();
    expect(tripLinkUrl(undefined, TOKEN)).toBeNull();
  });

  it('builds the deep link of the app', () => {
    expect(tripDeepLink(TOKEN)).toBe(`transport://viaje/${TOKEN}`);
  });
});

describe('parseTripLink', () => {
  it('reads the token of a web link, a deep link or a bare token', () => {
    expect(parseTripLink(`https://transport.mx/viaje/${TOKEN}`)).toBe(TOKEN);
    expect(parseTripLink(`https://transport.mx/viaje/${TOKEN}/?utm=x#y`)).toBe(TOKEN);
    expect(parseTripLink(`transport://viaje/${TOKEN}`)).toBe(TOKEN);
    expect(parseTripLink(` ${TOKEN} `)).toBe(TOKEN);
  });

  it('refuses anything else', () => {
    expect(parseTripLink(null)).toBeNull();
    expect(parseTripLink('')).toBeNull();
    expect(parseTripLink(`https://transport.mx/compartido/${TOKEN}`)).toBeNull();
    expect(parseTripLink('https://transport.mx/viaje/short')).toBeNull();
    expect(parseTripLink(`https://transport.mx/viaje/${TOKEN}x`)).toBeNull();
    expect(parseTripLink(`transport://viaje/${TOKEN.slice(0, 42)}!`)).toBeNull();
  });
});

describe('tripLinkMessage', () => {
  it('greets the operator by first name with the route and the URL', () => {
    expect(
      tripLinkMessage({
        operatorName: 'Pedro Ramírez',
        route: 'Monterrey, NL → Guadalajara, Jal',
        url: 'https://transport.mx/viaje/x',
      }),
    ).toBe(
      'Hola Pedro, tienes un viaje asignado: Monterrey, NL → Guadalajara, Jal. Ábrelo en la app: https://transport.mx/viaje/x',
    );
    expect(tripLinkCopy.message({ operatorName: 'Ana', route: 'A → B', url: 'u' })).toContain(
      'Hola Ana',
    );
  });
});

describe('WhatsApp and SMS', () => {
  it('uses the phone without + and adds 52 to a 10-digit Mexican number', () => {
    expect(whatsappPhone('+52 81 1234 5678')).toBe('528112345678');
    expect(whatsappPhone('8112345678')).toBe('528112345678');
    expect(whatsappPhone('123')).toBeNull();
    expect(whatsappPhone(null)).toBeNull();
  });

  it('puts the message in the URL, encoded', () => {
    expect(whatsappUrl('+528112345678', 'Hola & adiós')).toBe(
      'https://wa.me/528112345678?text=Hola%20%26%20adi%C3%B3s',
    );
    expect(whatsappUrl(null, 'x')).toBe('https://wa.me/?text=x');
    expect(smsUrl('8112345678', 'a b')).toBe('sms:+528112345678?body=a%20b');
    expect(smsUrl(null, 'a')).toBe('sms:?body=a');
  });
});

describe('canSendTripLink', () => {
  it('needs an operator and a trip between assigned and unloading', () => {
    expect(canSendTripLink({ status: 'assigned', operatorId: 'o' })).toBe(true);
    expect(canSendTripLink({ status: 'unloading', operatorId: 'o' })).toBe(true);
    expect(canSendTripLink({ status: 'assigned', operatorId: null })).toBe(false);
    expect(canSendTripLink({ status: 'pending_assignment', operatorId: null })).toBe(false);
    expect(canSendTripLink({ status: 'delivered', operatorId: 'o' })).toBe(false);
    expect(canSendTripLink({ status: 'closed', operatorId: 'o' })).toBe(false);
    expect(canSendTripLink({ status: 'cancelled', operatorId: 'o' })).toBe(false);
  });
});

describe('open_trip_operator_link answer', () => {
  it('accepts only the trip and the target', () => {
    expect(openTripLinkSchema.parse({ tripId: TRIP_ID, target: 'operator' })).toEqual({
      tripId: TRIP_ID,
      target: 'operator',
    });
    expect(openTripLinkSchema.safeParse({ tripId: TRIP_ID, target: 'shipper' }).success).toBe(
      false,
    );
    expect(
      openTripLinkSchema.safeParse({ tripId: TRIP_ID, target: 'carrier', extra: 1 }).success,
    ).toBe(false);
  });

  it('leads the operator to their trip and the staff to the detail', () => {
    expect(tripLinkDestination({ tripId: TRIP_ID, target: 'operator' }, 'operator')).toEqual({
      pathname: '/trip',
      params: { viaje: TRIP_ID },
    });
    expect(tripLinkDestination({ tripId: TRIP_ID, target: 'operator' }, 'carrier')).toEqual({
      pathname: '/my-trip',
      params: { viaje: TRIP_ID },
    });
    expect(tripLinkDestination({ tripId: TRIP_ID, target: 'carrier' }, 'carrier')).toEqual({
      pathname: '/trip/[id]',
      params: { id: TRIP_ID },
    });
  });
});

describe('tripLinkErrorText', () => {
  it('maps the errors of the RPCs to Spanish copy', () => {
    expect(tripLinkErrorText('42501')).toBe(tripLinkCopy.errors.notFound);
    expect(tripLinkErrorText('55000')).toBe(tripLinkCopy.errors.noOperator);
    expect(tripLinkErrorText('PT429')).toBe(tripLinkCopy.errors.rateLimited);
    expect(tripLinkErrorText(undefined)).toBe(tripLinkCopy.errors.generic);
  });
});

describe('universal links', () => {
  it('serves apple-app-site-association for /viaje/* only with a valid Team ID', () => {
    expect(appleAppSiteAssociation('ABCDE12345', 'mx.transport.app')).toEqual({
      applinks: {
        details: [{ appIDs: ['ABCDE12345.mx.transport.app'], components: [{ '/': '/viaje/*' }] }],
      },
    });
    expect(appleAppSiteAssociation(undefined, 'mx.transport.app')).toBeNull();
    expect(appleAppSiteAssociation('nope', 'mx.transport.app')).toBeNull();
  });

  it('serves assetlinks.json only with a valid SHA-256 fingerprint', () => {
    const fp = Array.from({ length: 32 }, () => 'ab').join(':');
    expect(androidAssetLinks(fp, 'mx.transport.app')).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'mx.transport.app',
          sha256_cert_fingerprints: [fp.toUpperCase()],
        },
      },
    ]);
    expect(androidAssetLinks('', 'mx.transport.app')).toBeNull();
    expect(androidAssetLinks('AB:CD', 'mx.transport.app')).toBeNull();
  });
});
