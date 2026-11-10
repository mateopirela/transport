// Pilot support (I2, D41): the channel is JP's WhatsApp Business. The number
// and the hours are platform settings the admin edits (never in the code or
// the seed); without a number "Ayuda" does not show. These helpers read the
// settings from the rows of platform_settings and build the wa.me link with
// a message that says who writes and, inside a trip, which one.
import { userRoleLabels } from './copy/catalogs';
import { supportCopy } from './copy/support';
import type { UserRole } from './enums';
import { isE164Phone, normalizeMxPhone } from './phone';

export const SUPPORT_SETTING_KEYS = {
  whatsapp: 'support.whatsapp',
  hours: 'support.hours',
} as const;

/** Longest support hours text the admin may save (mirrored in SQL). */
export const SUPPORT_HOURS_MAX_LENGTH = 200;

export interface SupportSettings {
  /** E.164, e.g. `+528112345678`, or null: no "Ayuda". */
  whatsapp: string | null;
  /** Free text, e.g. "Lunes a sábado, 8:00 a 20:00", or null. */
  hours: string | null;
}

/**
 * The code points that show nothing: white space (all that
 * String.prototype.trim removes, and the other controls) and the invisible
 * format characters (zero-width spaces and joiners, direction marks, the BOM,
 * the soft hyphen, the Hangul fillers, the blank braille pattern, variation
 * selectors and tags). Mirrored in SQL by admin_set_platform_setting, whose
 * first range starts at U+0001 because Postgres text holds no NUL.
 */
const INVISIBLE_RANGES: readonly (readonly [number, number])[] = [
  [0x0000, 0x0020],
  [0x007f, 0x00a0],
  [0x00ad, 0x00ad],
  [0x034f, 0x034f],
  [0x061c, 0x061c],
  [0x115f, 0x1160],
  [0x1680, 0x1680],
  [0x17b4, 0x17b5],
  [0x180b, 0x180f],
  [0x2000, 0x200f],
  [0x2028, 0x202f],
  [0x205f, 0x206f],
  [0x2800, 0x2800],
  [0x3000, 0x3000],
  [0x3164, 0x3164],
  [0xfe00, 0xfe0f],
  [0xfeff, 0xfeff],
  [0xffa0, 0xffa0],
  [0xfff9, 0xfffb],
  [0x1bca0, 0x1bca3],
  [0x1d173, 0x1d17a],
  [0xe0000, 0xe007f],
  [0xe0100, 0xe01ef],
];

/** Whether the text shows something, not only white space or invisible characters. */
function hasVisibleText(text: string): boolean {
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (!INVISIBLE_RANGES.some(([from, to]) => code >= from && code <= to)) return true;
  }
  return false;
}

/**
 * The settings from the rows of platform_settings. A missing or malformed
 * value counts as not set, so a bad row never shows a broken "Ayuda".
 */
export function parseSupportSettings(
  rows: readonly { key: string; value: unknown }[],
): SupportSettings {
  const value = (key: string) => rows.find((row) => row.key === key)?.value;
  const whatsapp = value(SUPPORT_SETTING_KEYS.whatsapp);
  const hours = value(SUPPORT_SETTING_KEYS.hours);
  return {
    whatsapp: isE164Phone(whatsapp as string | null) ? (whatsapp as string) : null,
    hours: typeof hours === 'string' && hasVisibleText(hours) ? hours.trim() : null,
  };
}

/**
 * What the admin typed as the support number, in E.164, or null when it is
 * not a phone (Mexican numbers may come with 10 digits; other countries in
 * E.164 already, as normalizeMxPhone).
 */
export function normalizeSupportWhatsapp(input: string | null | undefined): string | null {
  return normalizeMxPhone(input);
}

/**
 * Whether the support hours text can be saved: 1 to 200 characters after
 * trimming, at least one of them visible (a text of zero-width spaces would
 * show an empty schedule in "Ayuda").
 */
export function isValidSupportHours(input: string): boolean {
  const text = input.trim();
  return text.length > 0 && text.length <= SUPPORT_HOURS_MAX_LENGTH && hasVisibleText(text);
}

/**
 * Who writes, as the message says it: the role's label, or "Hombre camión"
 * for a Gerente of an owner-operator company (D13).
 */
export function supportRoleLabel(
  role: UserRole | null | undefined,
  isOwnerOperator = false,
): string | null {
  if (!role) return null;
  if (role === 'manager' && isOwnerOperator) return supportCopy.ownerOperatorRole;
  return userRoleLabels[role];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * The folio of a trip as support reads it: the first 8 characters of its id,
 * in capitals (e.g. `3F2A1B9C`). Null for anything that is not a trip id.
 */
export function tripFolio(tripId: string | null | undefined): string | null {
  if (typeof tripId !== 'string' || !UUID.test(tripId)) return null;
  return tripId.slice(0, 8).toUpperCase();
}

/**
 * The `https://wa.me/<digits>?text=…` link of "Ayuda", or null without a
 * valid number. The message says the role and, inside a trip, its folio.
 */
export function supportWhatsappUrl(params: {
  whatsapp: string | null | undefined;
  roleLabel: string | null | undefined;
  tripId?: string | null | undefined;
}): string | null {
  const { whatsapp, roleLabel, tripId } = params;
  if (!isE164Phone(whatsapp)) return null;
  const text = supportCopy.message(roleLabel ?? null, tripFolio(tripId));
  return `https://wa.me/${whatsapp.slice(1)}?text=${encodeURIComponent(text)}`;
}
