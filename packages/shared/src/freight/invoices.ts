// Freight invoices (I5, D37): Fulmis' fiscal data and the answers of the two
// Edge Functions that take a CFDI (validate-carrier-cfdi for the carrier's
// invoice to Fulmis, issue-client-cfdi for Fulmis' invoice to the client).
// The rules live in Postgres (…_freight_invoices.sql) and in cfdi.ts.
import { freightInvoiceFailureLabels, freightInvoicesCopy } from '../copy/freight-invoices';
import type { FreightInvoiceDirection } from '../enums';
import { formatCalendarDate } from '../formatters';
import { toMexicoCityDate } from '../verification';

export const FULMIS_SETTING_KEYS = {
  rfc: 'fulmis.rfc',
  legalName: 'fulmis.legal_name',
  taxRegime: 'fulmis.tax_regime',
  zip: 'fulmis.zip',
} as const;

export type FulmisSettingField = keyof typeof FULMIS_SETTING_KEYS;

/** Longest legal name the admin may save (mirrored in SQL). */
export const FULMIS_LEGAL_NAME_MAX_LENGTH = 300;

export interface FulmisFiscalData {
  rfc: string | null;
  legalName: string | null;
  taxRegime: string | null;
  zip: string | null;
}

const RFC = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/u;

/**
 * What the admin typed for a fulmis.* setting as Postgres saves it (trimmed;
 * the RFC without spaces and in capitals), or null when it is not valid.
 * Mirror of admin_set_platform_setting.
 */
export function normalizeFulmisSetting(field: FulmisSettingField, input: string): string | null {
  const value = input.trim();
  switch (field) {
    case 'rfc': {
      const rfc = value.replace(/[\s-]/gu, '').toUpperCase();
      return RFC.test(rfc) ? rfc : null;
    }
    case 'legalName':
      return value.length > 0 && value.length <= FULMIS_LEGAL_NAME_MAX_LENGTH ? value : null;
    case 'taxRegime':
      return /^[0-9]{3}$/u.test(value) ? value : null;
    case 'zip':
      return /^[0-9]{5}$/u.test(value) ? value : null;
  }
}

/** Fulmis' fiscal data from the rows of platform_settings; a malformed value counts as not set. */
export function parseFulmisSettings(
  rows: readonly { key: string; value: unknown }[],
): FulmisFiscalData {
  const read = (field: FulmisSettingField) => {
    const value = rows.find((row) => row.key === FULMIS_SETTING_KEYS[field])?.value;
    return typeof value === 'string' ? normalizeFulmisSetting(field, value) : null;
  };
  return {
    rfc: read('rfc'),
    legalName: read('legalName'),
    taxRegime: read('taxRegime'),
    zip: read('zip'),
  };
}

/** Every reason a CFDI is not taken (the parser's and the database's). */
export type FreightInvoiceFailure = keyof typeof freightInvoiceFailureLabels;

export function isFreightInvoiceFailure(value: unknown): value is FreightInvoiceFailure {
  return typeof value === 'string' && Object.hasOwn(freightInvoiceFailureLabels, value);
}

/** The Edge Function that takes a CFDI in each direction. */
export const FREIGHT_INVOICE_FUNCTIONS = {
  fulmis_to_client: 'issue-client-cfdi',
  carrier_to_fulmis: 'validate-carrier-cfdi',
} as const satisfies Record<FreightInvoiceDirection, string>;

/**
 * The lines to show when an upload fails, from the Edge Function's status and
 * JSON body: one per failed rule for an invalid CFDI, else one general line.
 */
export function freightInvoiceUploadErrors(status: number | null, body: unknown): string[] {
  const e = freightInvoicesCopy.errors;
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  if (status === 422 || status === 413) {
    const failures = Array.isArray(record.failures)
      ? record.failures.filter(isFreightInvoiceFailure)
      : [];
    if (failures.length > 0)
      return [...new Set(failures)].map((f) => freightInvoiceFailureLabels[f]);
  }
  if (status === 429) return [e.rateLimited];
  if (status === 401 || status === 403 || status === 404) return [e.notAllowed];
  return [e.generic];
}

/** The short form of a CFDI's UUID shown in lists: its first 8 characters in capitals. */
export function shortCfdiUuid(uuid: string): string {
  return uuid.slice(0, 8).toUpperCase();
}

/**
 * The day a CFDI was issued, in Mexico City, as lists show it ("6 nov 2026").
 * A stored date the app cannot read (one past year 9999 in UTC, registered
 * before the range check) shows as "fecha no válida" instead of breaking the
 * whole page: there is no way to replace a registered invoice.
 */
export function formatInvoiceIssuedDate(issuedAt: string): string {
  try {
    return formatCalendarDate(toMexicoCityDate(issuedAt));
  } catch {
    return freightInvoicesCopy.invalidIssuedAt;
  }
}
