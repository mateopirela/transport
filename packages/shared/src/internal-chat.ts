// Carrier's internal trip chat (H1, D28): one conversation per trip between
// the assigned operator, the coordinators of its business unit and the
// managers (Postgres decides who takes part: is_conversation_participant).
// Pure helpers shared by the web and the app.
import { internalChatCopy } from './copy/internal-chat';

/** `?chat=interno`: the trip screen opens with the internal chat tab. */
export const INTERNAL_CHAT_PARAM = 'interno';

/** `?chat=cliente`: the trip screen opens with the chat with the shipper (also the default). */
export const SHIPPER_CHAT_PARAM = 'cliente';

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

/** The conversation a `chat_message` notification is about: the trip or the negotiation chat. */
export type ChatMessageTarget =
  { kind: 'trip'; tripId: string } | { kind: 'negotiation'; negotiationId: string; loadId: string };

function uuidOf(data: unknown, key: string): string | null {
  const value =
    typeof data === 'object' && data !== null ? (data as Record<string, unknown>)[key] : null;
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;
}

/**
 * The trip or the negotiation of a `chat_message` notification, from its
 * data: `kind` and its ids (the push payload only carries the ids, so without
 * `kind` it follows them). Null when the ids are not UUIDs.
 */
export function chatMessageTarget(data: unknown): ChatMessageTarget | null {
  const kind =
    typeof data === 'object' && data !== null ? (data as Record<string, unknown>).kind : undefined;
  const tripId = uuidOf(data, 'tripId');
  if (kind !== 'negotiation' && tripId) return { kind: 'trip', tripId };
  const negotiationId = uuidOf(data, 'negotiationId');
  const loadId = uuidOf(data, 'loadId');
  if (kind !== 'trip' && negotiationId && loadId) {
    return { kind: 'negotiation', negotiationId, loadId };
  }
  return null;
}

/**
 * Where a `chat_message` notification leads: the trip (on the chat with the
 * shipper) or the negotiation, in the shipper's web, the carrier web and the
 * carrier app (where the negotiation lives in the load screen). The operator
 * never gets one (D28). Null when the data has no valid trip or negotiation.
 */
export function chatMessageRoutes(data: unknown): {
  shipperWeb: string;
  carrierWeb: string;
  carrierApp: string;
} | null {
  const target = chatMessageTarget(data);
  if (!target) return null;
  if (target.kind === 'trip') {
    const id = target.tripId;
    return {
      shipperWeb: `/cliente/viajes/${id}`,
      carrierWeb: `/transportista/viajes/${id}?chat=${SHIPPER_CHAT_PARAM}`,
      carrierApp: `/trip/${id}?chat=${SHIPPER_CHAT_PARAM}`,
    };
  }
  return {
    shipperWeb: `/cliente/cargas/${target.loadId}/negociaciones/${target.negotiationId}`,
    carrierWeb: `/transportista/negociaciones/${target.negotiationId}`,
    carrierApp: `/load/${target.loadId}`,
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

const LOCATION_URL =
  /^https:\/\/maps\.google\.com\/\?q=(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/u;

/**
 * The map link of a message sent with "Enviar mi ubicación", to open it with
 * a tap; null for any other text. The link is rebuilt from the coordinates,
 * so only a Google Maps link to a valid point ever opens.
 */
export function sharedLocationUrl(body: string | null): string | null {
  const prefix = internalChatCopy.location('');
  if (!body?.startsWith(prefix)) return null;
  const match = LOCATION_URL.exec(body.slice(prefix.length).trim());
  if (!match) return null;
  try {
    return locationMessage({ lat: Number(match[1]), lng: Number(match[2]) }).slice(prefix.length);
  } catch {
    return null;
  }
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
