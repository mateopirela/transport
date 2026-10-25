// Share links (G7, D23): pure rules shared by the web, the app and their
// tests. Postgres owns the security side (create_share_link, the public RPCs
// and 37_share_links.test.sql); this module builds the links, validates the
// token shape and parses the sanitized JSON of the public RPCs with strict
// schemas, so an unexpected key fails closed instead of reaching the screen.
import { z } from 'zod';

import { Constants } from './db';
import {
  CARGO_TYPES,
  LOAD_STATUSES,
  SPECIAL_REQUIREMENTS,
  TRIP_EVENT_TYPES,
  TRIP_STATUSES,
  UNIT_TYPES,
} from './enums';
import { publicSiteOrigin } from './legal';

export const SHARE_LINK_KINDS = Constants.public.Enums.share_link_kind;
export type ShareLinkKind = (typeof SHARE_LINK_KINDS)[number];

/** 32 random bytes as base64url without padding (create_share_link). */
export const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

/** Whether a value has the shape of a share token (never whether it exists). */
export function isShareToken(value: unknown): value is string {
  return typeof value === 'string' && SHARE_TOKEN_PATTERN.test(value);
}

/** Validity choices of the dialog, in hours. 720 h (30 days) is the maximum the RPC accepts. */
export const SHARE_VALIDITY_HOURS = [24, 72, 168, 720] as const;
export type ShareValidityHours = (typeof SHARE_VALIDITY_HOURS)[number];
export const MAX_SHARE_VALIDITY_HOURS = 720;

/** Default validity of each kind when the caller does not choose (mirrors create_share_link). */
export const DEFAULT_SHARE_VALIDITY_HOURS: Record<ShareLinkKind, ShareValidityHours> = {
  load_internal: 72,
  load_public: 168,
  trip_tracking_public: 720,
  trip_operator: 720,
};

/** One of the dialog's validity choices, or null for anything else. */
export function parseShareValidityHours(value: unknown): ShareValidityHours | null {
  const n = typeof value === 'string' ? Number(value) : value;
  const match = SHARE_VALIDITY_HOURS.find((hours) => hours === n);
  return match ?? null;
}

/** Web paths of the shared views. */
export const SHARE_PATHS = {
  /** Public, no session: a load or the tracking of a trip. */
  public: '/compartido',
  /** Internal: the carrier's staff, signed in. */
  internal: '/transportista/compartido',
} as const;

/** The URL scheme of the mobile app (app.config.ts). */
export const APP_SCHEME = 'transport';

/** Relative web path of a link. */
export function sharePath(kind: ShareLinkKind, token: string): string {
  const base = kind === 'load_internal' ? SHARE_PATHS.internal : SHARE_PATHS.public;
  return `${base}/${encodeURIComponent(token)}`;
}

/**
 * Absolute URL of a link on the public web app, or null when `siteUrl` is
 * missing or not https (http only on loopback, for local development).
 */
export function shareUrl(
  siteUrl: string | null | undefined,
  kind: ShareLinkKind,
  token: string,
): string | null {
  const origin = publicSiteOrigin(siteUrl);
  return origin ? `${origin}${sharePath(kind, token)}` : null;
}

/** Deep link that opens an internal link in the app (route shared/[token]). */
export function appShareLink(token: string): string {
  return `${APP_SCHEME}://compartido/${encodeURIComponent(token)}`;
}

/** How often the public tracking page reloads while the trip can still change. */
export const SHARE_TRACKING_REFRESH_MS = 60_000;

/** Hours after a trip closes during which its tracking links still open (share_link_by_token). */
export const SHARE_TRACKING_AFTER_CLOSE_HOURS = 24;

/**
 * Whether a new tracking link can be created for a trip (create_share_link):
 * not cancelled, and not past the window in which its links still open.
 */
export function canShareTripTracking(
  trip: { status: string; closed_at: string | null },
  now: Date,
): boolean {
  if (trip.status === 'cancelled') return false;
  if (trip.closed_at === null) return true;
  return Date.parse(trip.closed_at) + SHARE_TRACKING_AFTER_CLOSE_HOURS * 3_600_000 > now.getTime();
}

/** Statuses after which the shared tracking no longer changes on its own. */
const FINAL_TRIP_STATUSES: readonly string[] = ['closed', 'cancelled'];

/** Refresh interval of the public tracking page, or null once the trip is over. */
export function sharedTripRefreshMs(status: string): number | null {
  return FINAL_TRIP_STATUSES.includes(status) ? null : SHARE_TRACKING_REFRESH_MS;
}

// ---------------------------------------------------------------------------
// Sanitized JSON of the public RPCs. The schemas are strict: a key the RPC
// did not promise (price, addresses, contacts, documents, chat, operator)
// makes the parse fail and the page shows "no disponible" instead of leaking.
// ---------------------------------------------------------------------------

const place = z.strictObject({ city: z.string(), state: z.string() });
const window = z.strictObject({ start: z.string(), end: z.string() });
const isoDate = z.string();

export const publicSharedLoadSchema = z.strictObject({
  kind: z.literal('load'),
  status: z.enum(LOAD_STATUSES),
  origin: place,
  destination: place,
  pickupWindow: window,
  deliveryWindow: window,
  cargoType: z.enum(CARGO_TYPES),
  weightKg: z.number(),
  unitType: z.enum(UNIT_TYPES),
  specialRequirements: z.array(z.enum(SPECIAL_REQUIREMENTS)),
  expiresAt: isoDate,
});
export type PublicSharedLoad = z.infer<typeof publicSharedLoadSchema>;

export const publicSharedTripSchema = z.strictObject({
  kind: z.literal('trip'),
  status: z.enum(TRIP_STATUSES),
  origin: place,
  destination: place,
  pickupWindow: window,
  deliveryWindow: window,
  estimatedUnloadEndAt: isoDate.nullable(),
  carrierName: z.string(),
  unitType: z.enum(UNIT_TYPES).nullable(),
  /** `***` plus the last 3 characters, or null before a unit is assigned. */
  plateMasked: z.string().nullable(),
  timeline: z.array(z.strictObject({ type: z.enum(TRIP_EVENT_TYPES), occurredAt: isoDate })),
  /** Only while the trip is active; null otherwise. */
  lastPosition: z
    .strictObject({ lat: z.number(), lng: z.number(), recordedAt: isoDate })
    .nullable(),
  expiresAt: isoDate,
});
export type PublicSharedTrip = z.infer<typeof publicSharedTripSchema>;

/** The load behind an internal link (open_internal_share), as the company sees it. */
export const internalSharedLoadSchema = z.strictObject({
  kind: z.literal('load_internal'),
  loadId: z.uuid(),
  canOffer: z.boolean(),
  status: z.enum(LOAD_STATUSES),
  origin: place,
  destination: place,
  pickupWindow: window,
  deliveryWindow: window,
  cargoType: z.enum(CARGO_TYPES),
  description: z.string(),
  weightKg: z.number(),
  volumeM3: z.number().nullable(),
  unitType: z.enum(UNIT_TYPES),
  specialRequirements: z.array(z.enum(SPECIAL_REQUIREMENTS)),
  proposedPriceCents: z.number(),
  notes: z.string().nullable(),
  expiresAt: isoDate,
});
export type InternalSharedLoad = z.infer<typeof internalSharedLoadSchema>;

/**
 * Keys that must never appear anywhere in a public document, whatever the
 * RPC returns: the strict schemas already refuse unknown keys; this is the
 * list the tests (and a reviewer) can read.
 */
export const FORBIDDEN_PUBLIC_KEYS = [
  'proposedPriceCents',
  'agreedPriceCents',
  'price',
  'amountCents',
  'address',
  'originAddress',
  'destinationAddress',
  'originLat',
  'originLng',
  'destinationLat',
  'destinationLng',
  'placeId',
  'contactName',
  'contactPhone',
  'contactEmail',
  'email',
  'phone',
  'operatorName',
  'operator',
  'plate',
  'documents',
  'evidence',
  'messages',
  'conversationId',
  'notes',
  'description',
  'rfc',
  'shipperName',
] as const;

/** Every key of a JSON document, nested ones included (origin.city reads as "city"). */
export function jsonKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(jsonKeys);
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...jsonKeys(child)]);
}
