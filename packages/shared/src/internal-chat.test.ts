import { describe, expect, it } from 'vitest';

import { chatSenderLabel } from './chat';
import {
  notificationEmail,
  notificationWebPath,
  PUSH_ONLY_NOTIFICATION_TYPES,
} from './copy/notification-email';
import { notificationContent } from './copy/notifications';
import { QUICK_REPORTS } from './copy/internal-chat';
import {
  chatMessageRoutes,
  chatMessageTarget,
  hidesInternalChat,
  internalMessagePreview,
  internalMessageRoutes,
  locationMessage,
  sharedLocationUrl,
  tripChatTab,
} from './internal-chat';

const TRIP = '5eed0008-0000-4000-8000-000000000001';
const CONVERSATION = '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b';

describe('internal_message notification (H1)', () => {
  const data = {
    tripId: TRIP,
    conversationId: CONVERSATION,
    senderName: 'Pedro López',
    preview: 'Ya llegué a cargar',
    originCity: 'Monterrey',
    destinationCity: 'Guadalajara',
  };

  it('says who wrote and previews the text', () => {
    expect(notificationContent('internal_message', data)).toEqual({
      title: 'Mensaje de Pedro López',
      body: 'Ya llegué a cargar',
    });
  });

  it('shows "📷 Foto" for a message with attachments only, and the route without a sender', () => {
    expect(notificationContent('internal_message', { ...data, preview: null }).body).toBe(
      '📷 Foto',
    );
    expect(notificationContent('internal_message', { ...data, senderName: ' ' }).title).toBe(
      'Mensaje del viaje Monterrey → Guadalajara',
    );
  });

  it('leads the operator to their chat and the staff to the internal tab of the trip', () => {
    expect(internalMessageRoutes(TRIP)).toEqual({
      operatorApp: `/chat/${TRIP}`,
      carrierApp: `/trip/${TRIP}?chat=interno`,
      web: `/transportista/viajes/${TRIP}?chat=interno`,
    });
    expect(internalMessageRoutes(TRIP.toUpperCase())?.operatorApp).toBe(`/chat/${TRIP}`);
    expect(internalMessageRoutes('../x')).toBeNull();
    expect(internalMessageRoutes(undefined)).toBeNull();
    expect(notificationWebPath('coordinator', data)).toBe(
      `/transportista/viajes/${TRIP}?chat=interno`,
    );
    expect(notificationWebPath('manager', data)).toBe(`/transportista/viajes/${TRIP}?chat=interno`);
  });

  it('is sent by push only, never by email', () => {
    expect(PUSH_ONLY_NOTIFICATION_TYPES).toContain('internal_message');
    expect(PUSH_ONLY_NOTIFICATION_TYPES).not.toContain('offer_received');
    // The email exists (the dispatcher skips it), so a stray call still renders.
    expect(notificationEmail('internal_message', data, { role: 'manager' }).subject).toContain(
      'Mensaje de Pedro López',
    );
  });
});

describe('chat_message notification (chat with the shipper)', () => {
  const LOAD = '5eed0005-0000-4000-8000-000000000001';
  const NEGOTIATION = '5eed0006-0000-4000-8000-000000000004';
  const trip = {
    conversationId: CONVERSATION,
    kind: 'trip',
    tripId: TRIP,
    senderName: 'Ana Torres',
    preview: '¿A qué hora llegan?',
    loadId: LOAD,
    originCity: 'Monterrey',
    destinationCity: 'Guadalajara',
  };
  const negotiation = {
    ...trip,
    kind: 'negotiation',
    tripId: undefined,
    negotiationId: NEGOTIATION,
  };

  it('says who wrote and previews the text, or "📷 Foto"', () => {
    expect(notificationContent('chat_message', trip)).toEqual({
      title: 'Mensaje de Ana Torres',
      body: '¿A qué hora llegan?',
    });
    expect(notificationContent('chat_message', { ...trip, preview: null }).body).toBe('📷 Foto');
  });

  it('names the trip or the negotiation without a sender', () => {
    expect(notificationContent('chat_message', { ...trip, senderName: null }).title).toBe(
      'Mensaje del viaje Monterrey → Guadalajara',
    );
    expect(notificationContent('chat_message', { ...negotiation, senderName: '' }).title).toBe(
      'Mensaje de la negociación Monterrey → Guadalajara',
    );
  });

  it('leads to the trip, on the chat with the shipper, or to the negotiation', () => {
    expect(chatMessageTarget(trip)).toEqual({ kind: 'trip', tripId: TRIP });
    expect(chatMessageRoutes(trip)).toEqual({
      shipperWeb: `/cliente/viajes/${TRIP}`,
      carrierWeb: `/transportista/viajes/${TRIP}?chat=cliente`,
      carrierApp: `/trip/${TRIP}?chat=cliente`,
    });
    expect(chatMessageRoutes(negotiation)).toEqual({
      shipperWeb: `/cliente/cargas/${LOAD}/negociaciones/${NEGOTIATION}`,
      carrierWeb: `/transportista/negociaciones/${NEGOTIATION}`,
      carrierApp: `/load/${LOAD}`,
    });
    // The push payload has no kind: the ids decide.
    expect(chatMessageTarget({ negotiationId: NEGOTIATION, loadId: LOAD })).toEqual({
      kind: 'negotiation',
      negotiationId: NEGOTIATION,
      loadId: LOAD,
    });
    expect(chatMessageTarget({ tripId: TRIP.toUpperCase() })).toEqual({
      kind: 'trip',
      tripId: TRIP,
    });
    // A kind that contradicts the ids, or malformed ids, lead nowhere.
    expect(chatMessageTarget({ kind: 'negotiation', tripId: TRIP })).toBeNull();
    expect(
      chatMessageTarget({ kind: 'trip', negotiationId: NEGOTIATION, loadId: LOAD }),
    ).toBeNull();
    expect(chatMessageRoutes({ tripId: '../x' })).toBeNull();
    expect(chatMessageRoutes(null)).toBeNull();
    expect(tripChatTab('cliente')).toBe('shipper');
  });

  it('is sent by push only, and the email link (if ever) keeps each chat on its tab', () => {
    expect(PUSH_ONLY_NOTIFICATION_TYPES).toContain('chat_message');
    expect(notificationWebPath('coordinator', trip)).toBe(
      `/transportista/viajes/${TRIP}?chat=cliente`,
    );
    expect(notificationWebPath('manager', negotiation)).toBe(
      `/transportista/negociaciones/${NEGOTIATION}`,
    );
    expect(notificationWebPath('shipper', trip)).toBe(`/cliente/viajes/${TRIP}`);
  });
});

describe('quick reports and location', () => {
  it('are the six reports JP asked for, ready to send', () => {
    expect(QUICK_REPORTS).toEqual([
      'Ya llegué a cargar',
      'Ya llegué a descargar',
      'Voy con retraso',
      'Estoy esperando turno',
      'Tengo un problema en carretera',
      'Todo en orden',
    ]);
    for (const report of QUICK_REPORTS) expect(report.length).toBeLessThanOrEqual(80);
  });

  it('builds the location message with a Google Maps link', () => {
    expect(locationMessage({ lat: 25.686614, lng: -100.316116 })).toBe(
      'Mi ubicación: https://maps.google.com/?q=25.686614,-100.316116',
    );
    expect(locationMessage({ lat: 20.6597, lng: -103.3496 })).toBe(
      'Mi ubicación: https://maps.google.com/?q=20.6597,-103.3496',
    );
    expect(locationMessage({ lat: 20.123456789, lng: -0 })).toBe(
      'Mi ubicación: https://maps.google.com/?q=20.123457,0',
    );
  });

  it('finds the map link of a shared location, and only that', () => {
    const sent = locationMessage({ lat: 20.633, lng: -103.361 });
    expect(sharedLocationUrl(sent)).toBe('https://maps.google.com/?q=20.633,-103.361');
    expect(sharedLocationUrl('Ya llegué a cargar')).toBeNull();
    expect(sharedLocationUrl(null)).toBeNull();
    // Other hosts, extra text or a point outside the globe never open.
    expect(sharedLocationUrl('Mi ubicación: https://evil.example/?q=20,-103')).toBeNull();
    expect(sharedLocationUrl('Mi ubicación: https://maps.google.com/?q=20,-103&x=1')).toBeNull();
    expect(sharedLocationUrl('Mi ubicación: https://maps.google.com/?q=95,-103')).toBeNull();
    expect(sharedLocationUrl('Mi ubicación: javascript:alert(1)')).toBeNull();
  });

  it('refuses a point outside the globe', () => {
    expect(() => locationMessage({ lat: 91, lng: 0 })).toThrow(RangeError);
    expect(() => locationMessage({ lat: 0, lng: Number.NaN })).toThrow(RangeError);
  });
});

describe('trip chat tabs and visibility', () => {
  it('opens the internal tab only with ?chat=interno', () => {
    expect(tripChatTab('interno')).toBe('internal');
    expect(tripChatTab(['interno', 'x'])).toBe('internal');
    expect(tripChatTab('cliente')).toBe('shipper');
    expect(tripChatTab(undefined)).toBe('shipper');
  });

  it('hides the internal chat from a hombre-camión working alone (D13-E1)', () => {
    expect(hidesInternalChat({ isOwnerOperator: true, staffCount: 1 })).toBe(true);
    expect(hidesInternalChat({ isOwnerOperator: true, staffCount: 2 })).toBe(false);
    expect(hidesInternalChat({ isOwnerOperator: false, staffCount: 1 })).toBe(false);
  });

  it('previews a message by its text, or as a photo', () => {
    expect(internalMessagePreview('  Voy\ncon retraso ', 0)).toBe('Voy con retraso');
    expect(internalMessagePreview(null, 2)).toBe('📷 Foto');
    expect(internalMessagePreview(null, 0)).toBe('');
  });

  it('tells the carrier staff apart in the internal chat only', () => {
    const coordinator = { sender_id: 'u2', sender_role: 'coordinator' as const };
    const manager = { sender_id: 'u3', sender_role: 'manager' as const };
    expect(chatSenderLabel(coordinator, 'u1')).toBe('Transportista');
    expect(chatSenderLabel(coordinator, 'u1', true)).toBe('Coordinador');
    expect(chatSenderLabel(manager, 'u1', true)).toBe('Gerente');
    expect(chatSenderLabel({ sender_id: 'u4', sender_role: 'operator' }, 'u1', true)).toBe(
      'Operador',
    );
    expect(chatSenderLabel(coordinator, 'u2', true)).toBe('Tú');
  });
});
