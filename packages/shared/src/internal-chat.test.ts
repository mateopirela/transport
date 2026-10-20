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
  hidesInternalChat,
  internalMessagePreview,
  internalMessageRoutes,
  locationMessage,
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
