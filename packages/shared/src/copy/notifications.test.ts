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
    expect(notificationContent('trip_unassigned', ROUTE)).toEqual({
      title: 'Viaje reasignado',
      body: 'El viaje Monterrey → Guadalajara se asignó a otro operador. Ya no lo tienes a tu cargo.',
    });
    expect(notificationContent('load_match', ROUTE).body).toContain('Monterrey → Guadalajara');
  });

  it('tells the shipper how many carrier documents it can see (G6)', () => {
    expect(notificationContent('documents_shared', { ...ROUTE, count: 4 })).toEqual({
      title: 'Documentos del transportista',
      body: 'Ya puedes consultar 4 documentos del transportista del viaje Monterrey → Guadalajara.',
    });
    expect(notificationContent('documents_shared', { count: 1 }).body).toBe(
      'Ya puedes consultar 1 documento del transportista del viaje.',
    );
    expect(notificationContent('documents_shared', { count: -1 }).body).toContain('documentos');
  });

  it('names the shipper and the decision of a provider approval (G6)', () => {
    const shipper = { shipperName: 'Aceros del Norte' };
    expect(
      notificationContent('provider_status_changed', { ...shipper, status: 'approved' }),
    ).toEqual({
      title: 'Alta de proveedor',
      body: 'Aceros del Norte dio de alta a tu empresa como proveedor aprobado.',
    });
    expect(
      notificationContent('provider_status_changed', { ...shipper, status: 'rejected' }).body,
    ).toContain('rechazó');
    expect(
      notificationContent('provider_status_changed', { ...shipper, status: 'revoked' }).body,
    ).toContain('revocó');
    expect(notificationContent('provider_status_changed', { status: 'x' }).body).toBe(
      'El cliente cambió el alta de tu empresa como proveedor.',
    );
  });

  it('names the trip document that was added (G6)', () => {
    expect(
      notificationContent('trip_document_added', { ...ROUTE, documentKind: 'carta_porte' }).body,
    ).toBe('Se agregó CFDI con complemento Carta Porte al viaje Monterrey → Guadalajara.');
    expect(notificationContent('trip_document_added', { documentKind: 'nope' }).body).toBe(
      'Se agregó un documento al viaje.',
    );
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
