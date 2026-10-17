import { describe, expect, it } from 'vitest';

import { NOTIFICATION_TYPES } from '../enums';
import { notificationEmail, notificationWebPath } from './notification-email';
import { notificationContent } from './notifications';

const LOAD = '0b6a8f0e-7f43-4f6e-9d2a-3f1e2d4c5b6a';
const SITE = 'https://transport.example';

describe('notification email', () => {
  it('has the same title and body as the push for every type', () => {
    for (const type of NOTIFICATION_TYPES) {
      const data = { loadId: LOAD, originCity: 'Monterrey', destinationCity: 'Guadalajara' };
      const { title, body } = notificationContent(type, data);
      const email = notificationEmail(type, data, { role: 'shipper', siteUrl: SITE });
      expect(email.subject).toBe(`${title} · Transporte de carga`);
      expect(email.text).toContain(body);
      expect(email.html).toContain('<html lang="es-MX">');
    }
  });

  it('links the shipper to the load and the admin to the panel', () => {
    expect(notificationWebPath('shipper', { loadId: LOAD.toUpperCase() })).toBe(
      `/cliente/cargas/${LOAD}`,
    );
    expect(notificationWebPath('shipper', { loadId: LOAD, tripId: LOAD })).toBe(
      `/cliente/viajes/${LOAD}`,
    );
    expect(notificationWebPath('shipper', { loadId: LOAD, tripId: 'x' })).toBe(
      `/cliente/cargas/${LOAD}`,
    );
    expect(notificationWebPath('shipper', { loadId: '../admin' })).toBe('/cliente/notificaciones');
    expect(notificationWebPath('shipper', null)).toBe('/cliente/notificaciones');
    expect(notificationWebPath('admin', { loadId: LOAD })).toBe('/admin');
    expect(notificationWebPath('manager', { loadId: LOAD })).toBeNull();
    expect(notificationWebPath(null, {})).toBeNull();

    const email = notificationEmail(
      'offer_received',
      { loadId: LOAD },
      { role: 'shipper', siteUrl: `${SITE}/x/` },
    );
    expect(email.text).toContain(`Abrir en la plataforma: ${SITE}/cliente/cargas/${LOAD}`);
    expect(email.html).toContain(`href="${SITE}/cliente/cargas/${LOAD}"`);
  });

  it('leaves the link out without a valid http(s) site URL', () => {
    for (const siteUrl of [
      undefined,
      '',
      'javascript:alert(1)',
      'not a url',
      'https://u:p@x.test',
    ]) {
      const email = notificationEmail(
        'offer_received',
        { loadId: LOAD },
        { role: 'shipper', siteUrl },
      );
      expect(email.html).not.toContain('<a ');
      expect(email.text).not.toContain('Abrir en la plataforma');
    }
  });

  it('escapes user data in the HTML', () => {
    const email = notificationEmail(
      'document_rejected',
      { requirementName: '<b>Póliza</b>', reviewNotes: 'Falta "firma" & sello' },
      { role: 'shipper' },
    );
    expect(email.html).toContain('&lt;b&gt;Póliza&lt;/b&gt;');
    expect(email.html).toContain('Falta &quot;firma&quot; &amp; sello');
    expect(email.html).not.toContain('<b>');
    expect(email.text).toContain('<b>Póliza</b>');
  });
});
