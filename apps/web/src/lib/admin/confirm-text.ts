import { formatBasisPoints, formatMoney, parsePesosToCents } from '@transport/shared';

/*
 * What the confirmations of the admin's forms read from the form
 * (docs/plan-fulmis.md §2 V5): the dialog says the amount, the commission or
 * the key that is about to be saved, as the server will read them. Pure.
 */

/** The text of a form field, trimmed ("" when it is missing or a file). */
export function formText(data: FormData, field: string): string {
  const entry = data.get(field);
  return typeof entry === 'string' ? entry.trim() : '';
}

/** An amount of a form field written as money ("$38,000"), or null when it is not one. */
export function formAmount(data: FormData, field: string): string | null {
  const cents = parsePesosToCents(formText(data, field));
  return cents === null ? null : formatMoney(cents);
}

/** A commission in basis points as the dialog says it ("3 %"), or the text as typed. */
export function bpsText(value: string): string {
  const bps = Number(value);
  return value !== '' && Number.isInteger(bps) ? formatBasisPoints(bps) : value;
}
