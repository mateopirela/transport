// Money is integer MXN cents everywhere (bigint in Postgres). Never floats.

/** Upper bound for a single amount: $100,000,000.00 MXN, well within safe integers. */
export const MAX_AMOUNT_CENTS = 10_000_000_000;

const PESOS_PATTERN = /^\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/u;

/**
 * Parses what a person types in a price field ("$12,500.50", "12500", "12500.5")
 * into integer cents, using string arithmetic only. Returns `null` when the text
 * is not a non-negative amount with at most two decimals.
 */
export function parsePesosToCents(input: string): number | null {
  const match = PESOS_PATTERN.exec(input.trim());
  if (!match) return null;
  const [, whole = '', fraction = ''] = match;
  const cents = Number(whole.replaceAll(',', '')) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Normalizes a cents value from the database (int8 may arrive as number, string or bigint). */
export function toCents(value: number | bigint | string): number {
  const cents = typeof value === 'string' && /^-?\d+$/u.test(value) ? Number(value) : value;
  if (typeof cents === 'bigint') {
    if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < BigInt(Number.MIN_SAFE_INTEGER)) {
      throw new RangeError('Amount exceeds the safe integer range');
    }
    return Number(cents);
  }
  if (typeof cents !== 'number' || !Number.isSafeInteger(cents)) {
    throw new TypeError(`Invalid cents value: ${String(value)}`);
  }
  return cents;
}

/**
 * Integer cents as the plain text of a price field ("99900" → "999.00"), the
 * inverse of parsePesosToCents. String arithmetic only, never floats.
 */
export function centsToPesosInput(cents: number | bigint | string): string {
  const value = toCents(cents);
  const sign = value < 0 ? '-' : '';
  const digits = String(Math.abs(value)).padStart(3, '0');
  return `${sign}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}
