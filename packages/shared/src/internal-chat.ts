// Carrier's internal trip chat (H1, D28): one conversation per trip between
// the assigned operator, the coordinators of its business unit and the
// managers (Postgres decides who takes part: is_conversation_participant).
// Pure helpers shared by the web and the app.
import { internalChatCopy } from './copy/internal-chat';

/** `?chat=interno`: the trip screen opens with the internal chat tab. */
export const INTERNAL_CHAT_PARAM = 'interno';

export type TripChatTab = 'shipper' | 'internal';

/** The tab of a trip screen's `chat` query param (the shipper's by default). */
export function tripChatTab(value: string | string[] | null | undefined): TripChatTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === INTERNAL_CHAT_PARAM ? 'internal' : 'shipper';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * Where an `internal_message` notification leads: the operator's chat screen
 * of the trip in the app (it opens even for a cancelled or closed trip), the
 * trip of the carrier staff in the app and in the web, on the internal tab.
 * Null when the trip id is not a UUID.
 */
export function internalMessageRoutes(tripId: unknown): {
  operatorApp: string;
  carrierApp: string;
  web: string;
} | null {
  if (typeof tripId !== 'string' || !UUID.test(tripId)) return null;
  const id = tripId.toLowerCase();
  return {
    operatorApp: `/chat/${id}`,
    carrierApp: `/trip/${id}?chat=${INTERNAL_CHAT_PARAM}`,
    web: `/transportista/viajes/${id}?chat=${INTERNAL_CHAT_PARAM}`,
  };
}

/**
 * The text of "Enviar mi ubicación": a Google Maps link to the point, with
 * six decimals (about 10 cm). Throws on a point outside the globe.
 */
export function locationMessage({ lat, lng }: { lat: number; lng: number }): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new RangeError('Invalid coordinates');
  }
  // `+` drops trailing zeros (and turns -0 into 0).
  const fixed = (value: number) => String(+value.toFixed(6));
  return internalChatCopy.location(`https://maps.google.com/?q=${fixed(lat)},${fixed(lng)}`);
}

/**
 * Whether a carrier hides the internal chat (D13-E1): a hombre-camión with no
 * other staff would only talk to themself. `staffCount` counts the accounts
 * of the company, the viewer included.
 */
export function hidesInternalChat({
  isOwnerOperator,
  staffCount,
}: {
  isOwnerOperator: boolean;
  staffCount: number;
}): boolean {
  return isOwnerOperator && staffCount <= 1;
}

/** Preview of a message in the lists: its text, or "📷 Foto" for attachments only. */
export function internalMessagePreview(body: string | null, attachments: number): string {
  const text = body?.replace(/\s+/gu, ' ').trim();
  if (text) return text;
  return attachments > 0 ? internalChatCopy.photoPreview : '';
}
