import { describe, expect, it } from 'vitest';

import { NOTIFICATION_TYPES } from '../enums';
import { notificationContent } from './notifications';

const ROUTE = { loadId: 'l1', originCity: 'Monterrey', destinationCity: 'Guadalajara' };

describe('notification content', () => {
  it('has a Spanish title and body for every type, even without data', () => {
    for (const type of NOTIFICATION_TYPES) {
      for (const data of [{}, null, 'x', ROUTE]) {
        const content = notificationContent(type, data);
        expect(content.title.trim()).not.toBe('');
        expect(content.body.trim()).not.toBe('');
        expect(content.body).not.toContain('undefined');
      }
    }
  });

  it('shows the amount and the route of offers', () => {
    const data = { ...ROUTE, amountCents: 3_450_000, side: 'shipper' };
    expect(notificationContent('offer_received', data).body).toBe(
      'Recibiste una oferta de $34,500.00 por tu carga Monterrey → Guadalajara.',
    );
    expect(notificationContent('counter_offer_received', data).body).toContain('$34,500.00');
    expect(notificationContent('offer_accepted', data).body).toContain('Aceptaron tu oferta');
    expect(notificationContent('offer_received', { amountCents: 1.5 }).body).toBe(
      'Recibiste una oferta por tu carga.',
    );
  });

  it('describes trip changes with the event label, or else the status', () => {
    expect(
      notificationContent('trip_status_changed', {
        ...ROUTE,
        eventType: 'departed',
        status: 'en_route_to_pickup',
      }),
    ).toEqual({ title: 'Viaje Monterrey → Guadalajara', body: 'Salida.' });
    expect(notificationContent('trip_status_changed', { status: 'delivered' }).body).toBe(
      'Entregado.',
    );
    expect(notificationContent('trip_status_changed', { eventType: 'nope' }).body).toBe(
      'El estado del viaje cambió.',
    );
    expect(notificationContent('trip_assigned', ROUTE).body).toContain('Monterrey → Guadalajara');
    expect(notificationContent('load_match', ROUTE).body).toContain('Monterrey → Guadalajara');
  });

  it('names the document and the reason of a rejection', () => {
    const data = { requirementName: 'Comprobante de domicilio', reviewNotes: 'Es ilegible.' };
    expect(notificationContent('document_approved', data).body).toBe(
      'Aprobamos Comprobante de domicilio.',
    );
    expect(notificationContent('document_rejected', data).body).toBe(
      'Rechazamos Comprobante de domicilio. Motivo: Es ilegible. Sube una nueva versión.',
    );
    expect(notificationContent('document_rejected', {}).body).toBe(
      'Rechazamos tu documento. Sube una nueva versión.',
    );
  });

  it('says when a document expires', () => {
    const name = { requirementName: 'Póliza de seguro' };
    expect(notificationContent('document_expiring', { ...name, daysLeft: 30 }).body).toBe(
      'Póliza de seguro vence en 30 días. Actualízalo para seguir operando.',
    );
    expect(notificationContent('document_expiring', { ...name, daysLeft: 1 }).body).toContain(
      'vence mañana',
    );
    expect(notificationContent('document_expiring', { ...name, daysLeft: 0 }).body).toContain(
      'vence hoy',
    );
    expect(notificationContent('document_expiring', { daysLeft: -2 }).body).toBe(
      'Uno de tus documentos vence pronto. Actualízalo para seguir operando.',
    );
  });

  it('names the unit or the operator of an expiring document', () => {
    expect(
      notificationContent('document_expiring', {
        requirementName: 'Tarjeta de circulación',
        ownerLabel: 'AB-123-CD',
        daysLeft: 7,
      }).body,
    ).toBe('Tarjeta de circulación (AB-123-CD) vence en 7 días. Actualízalo para seguir operando.');
  });

  it('reminds the operator to resume tracking', () => {
    const content = notificationContent('trip_location_stale', {
      ...ROUTE,
      hoursWithoutLocation: 4,
    });
    expect(content.title).toBe('No recibimos tu ubicación');
    expect(content.body).toBe(
      'No hemos recibido la ubicación del viaje Monterrey → Guadalajara en las últimas 4 horas. Abre la app para reanudar el seguimiento.',
    );
    expect(notificationContent('trip_location_stale', { hoursWithoutLocation: 1 }).body).toContain(
      'del viaje en las últimas horas.',
    );
  });
});
