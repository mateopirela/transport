// CFDI 4.0 of the freight (I5, D37): the carrier's invoice to Fulmis and
// Fulmis' invoice to the client. This module reads the few fields the
// platform checks (version, type, currency, total, issuer, receiver, date and
// the UUID of the stamp) from the XML, with a small parser written for that:
//
//   * No DTD: a document with <!DOCTYPE or <!ENTITY is rejected before
//     parsing, so external entities (XXE) and entity expansion ("billion
//     laughs") are impossible. Only the five predefined entities and numeric
//     character references are decoded.
//   * Bounded: at most CFDI_XML_MAX_BYTES, 64 levels, 20,000 elements and 100
//     attributes per element; one pass, no backtracking regular expressions.
//   * Namespaces resolved: the elements are matched by namespace URI and
//     local name, not by prefix.
//
// It has no imports on purpose: the Edge Functions (Deno) import this same
// file. What each file must match (issuer, receiver, total, unique UUID)
// lives in Postgres (…_freight_invoices.sql), which checks it again.

/** Largest XML accepted (bytes). A freight CFDI is a few kilobytes. */
export const CFDI_XML_MAX_BYTES = 1_048_576;
/** Largest PDF accepted (bytes); mirrored by the `invoices` bucket. */
export const CFDI_PDF_MAX_BYTES = 5_242_880;

export const CFDI_NAMESPACE = 'http://www.sat.gob.mx/cfd/4';
export const TFD_NAMESPACE = 'http://www.sat.gob.mx/TimbreFiscalDigital';

const MAX_DEPTH = 64;
const MAX_ELEMENTS = 20_000;
const MAX_ATTRIBUTES = 100;

/** Why an XML is not a CFDI the platform can take; each one has its copy. */
export type CfdiIssue =
  | 'too_large'
  | 'malformed'
  | 'dtd'
  | 'not_cfdi'
  | 'version'
  | 'type'
  | 'currency'
  | 'total'
  | 'issuer_rfc'
  | 'receiver_rfc'
  | 'issued_at'
  | 'uuid';

export interface ParsedCfdi {
  /** UUID of the stamp (TimbreFiscalDigital), lowercase. */
  uuid: string;
  issuerRfc: string;
  issuerName: string | null;
  receiverRfc: string;
  receiverName: string | null;
  /** Total in cents, rounded half up from the XML's decimals. */
  totalCents: number;
  currency: string;
  /** `Fecha` as written (local time of the issuer, no zone): `2026-11-06T10:00:00`. */
  issuedAt: string;
}

export type CfdiParseResult = { ok: true; cfdi: ParsedCfdi } | { ok: false; issues: CfdiIssue[] };

interface XmlElement {
  namespace: string | null;
  local: string;
  attributes: Map<string, string>;
  parent: XmlElement | null;
}

class XmlError extends Error {
  constructor(readonly issue: 'malformed' | 'dtd' | 'too_large') {
    super(issue);
  }
}

const NAME_START = /[A-Za-z_]/u;
const NAME_CHAR = /[A-Za-z0-9_.-]/u;
const SPACE = /[ \t\r\n]/u;

/** The references XML allows without a DTD: the five predefined entities and character references. */
const REFERENCE = /&(?:lt|gt|amp|quot|apos|#x[0-9A-Fa-f]{1,6}|#[0-9]{1,7});/gu;

function decodeEntities(value: string): string {
  if (value.includes('<')) throw new XmlError('malformed');
  // Every `&` must begin one of them: a bare `&` or any other entity is not XML.
  if (value.replace(REFERENCE, '').includes('&')) throw new XmlError('malformed');
  return value.replace(/&([^;&]{1,10});/gu, (_match, entity: string) => {
    switch (entity) {
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'amp':
        return '&';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
    }
    const code = /^#x[0-9A-Fa-f]{1,6}$/u.test(entity)
      ? Number.parseInt(entity.slice(2), 16)
      : /^#[0-9]{1,7}$/u.test(entity)
        ? Number.parseInt(entity.slice(1), 10)
        : Number.NaN;
    if (
      !Number.isInteger(code) ||
      code < 1 ||
      code > 0x10ffff ||
      (code >= 0xd800 && code <= 0xdfff)
    ) {
      throw new XmlError('malformed');
    }
    return String.fromCodePoint(code);
  });
}

/**
 * Walks the document and hands every start tag (with its parent, namespaces
 * resolved) to `visit`. Throws XmlError when it is not well formed.
 */
function walkXml(xml: string, visit: (element: XmlElement) => void): void {
  if (/<!DOCTYPE|<!ENTITY/iu.test(xml)) throw new XmlError('dtd');
  const text = xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml;
  const stack: { element: XmlElement; name: string; scope: Map<string, string> }[] = [];
  let index = 0;
  let elements = 0;
  let rootClosed = false;

  const fail = (): never => {
    throw new XmlError('malformed');
  };
  const skipSpaces = () => {
    while (index < text.length && SPACE.test(text.charAt(index))) index++;
  };
  const readName = (): string => {
    const start = index;
    if (!NAME_START.test(text.charAt(index))) fail();
    index++;
    while (index < text.length && NAME_CHAR.test(text.charAt(index))) index++;
    if (text.charAt(index) === ':') {
      index++;
      if (!NAME_START.test(text.charAt(index))) fail();
      index++;
      while (index < text.length && NAME_CHAR.test(text.charAt(index))) index++;
    }
    return text.slice(start, index);
  };
  const skipPast = (marker: string) => {
    const end = text.indexOf(marker, index);
    if (end < 0) fail();
    index = end + marker.length;
  };

  while (index < text.length) {
    const lt = text.indexOf('<', index);
    const between = lt < 0 ? text.slice(index) : text.slice(index, lt);
    // Outside the root only spaces; inside, text is ignored (but must not
    // carry a broken entity).
    if (stack.length === 0 && between.trim() !== '') fail();
    if (stack.length > 0) decodeEntities(between);
    if (lt < 0) break;
    index = lt;

    if (text.startsWith('<?', index)) {
      skipPast('?>');
    } else if (text.startsWith('<!--', index)) {
      index += 4;
      skipPast('-->');
    } else if (text.startsWith('<![CDATA[', index)) {
      if (stack.length === 0) fail();
      index += 9;
      skipPast(']]>');
    } else if (text.startsWith('<!', index)) {
      throw new XmlError('dtd');
    } else if (text.startsWith('</', index)) {
      index += 2;
      const name = readName();
      skipSpaces();
      if (text.charAt(index) !== '>') fail();
      index++;
      const top = stack.pop();
      if (!top || top.name !== name) fail();
      if (stack.length === 0) rootClosed = true;
    } else {
      if (rootClosed) fail();
      index++;
      const name = readName();
      const raw = new Map<string, string>();
      for (;;) {
        const before = index;
        skipSpaces();
        const char = text.charAt(index);
        if (char === '/' || char === '>') break;
        if (index === before) fail();
        const attribute = readName();
        skipSpaces();
        if (text.charAt(index) !== '=') fail();
        index++;
        skipSpaces();
        const quote = text.charAt(index);
        if (quote !== '"' && quote !== "'") fail();
        const end = text.indexOf(quote, index + 1);
        if (end < 0) fail();
        if (raw.has(attribute) || raw.size >= MAX_ATTRIBUTES) fail();
        raw.set(attribute, decodeEntities(text.slice(index + 1, end)));
        index = end + 1;
      }
      const selfClosing = text.charAt(index) === '/';
      if (selfClosing) index++;
      if (text.charAt(index) !== '>') fail();
      index++;

      elements++;
      if (elements > MAX_ELEMENTS || stack.length >= MAX_DEPTH) fail();
      const parentFrame = stack.at(-1);
      const scope = new Map(parentFrame?.scope ?? []);
      const attributes = new Map<string, string>();
      for (const [key, value] of raw) {
        if (key === 'xmlns') scope.set('', value);
        else if (key.startsWith('xmlns:')) scope.set(key.slice(6), value);
        else if (!key.includes(':')) attributes.set(key, value);
      }
      const colon = name.indexOf(':');
      const prefix = colon < 0 ? '' : name.slice(0, colon);
      const namespace = scope.get(prefix) ?? null;
      if (prefix !== '' && namespace === null) fail();
      const element: XmlElement = {
        namespace,
        local: colon < 0 ? name : name.slice(colon + 1),
        attributes,
        parent: parentFrame?.element ?? null,
      };
      visit(element);
      if (selfClosing) {
        if (stack.length === 0) rootClosed = true;
      } else {
        stack.push({ element, name, scope });
      }
    }
  }
  if (stack.length > 0 || !rootClosed) fail();
}

const RFC = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/u;
const DECIMAL = /^(\d{1,15})(?:\.(\d{1,6}))?$/u;

/** An RFC as the SAT writes it: trimmed and in capitals. Null when it is not one. */
export function cfdiRfc(value: string | undefined): string | null {
  const rfc = (value ?? '').trim().toUpperCase();
  return RFC.test(rfc) ? rfc : null;
}

/** A CFDI amount ("9700", "9700.5", "9700.005000") in cents, half up. Null when invalid. */
export function cfdiAmountCents(value: string | undefined): number | null {
  const match = DECIMAL.exec((value ?? '').trim());
  if (!match) return null;
  const [, whole = '0', decimals = ''] = match;
  const padded = decimals.padEnd(6, '0');
  // Cents plus the four remaining digits: round half up on them.
  const cents = BigInt(whole) * 100n + BigInt(padded.slice(0, 2));
  const rest = Number(padded.slice(2));
  const total = cents + (rest >= 5000 ? 1n : 0n);
  return total <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(total) : null;
}

/**
 * Earliest `Fecha` taken: CFDI 4.0 came into force on 2022-01-01. Mirrored by
 * record_freight_invoice_service and the freight_invoices_issued_at_range check.
 */
export const CFDI_MIN_ISSUED_AT = '2022-01-01T00:00:00';
/**
 * How far past the current time a `Fecha` may be (milliseconds). The SAT does
 * not stamp a CFDI dated in the future; the margin covers clocks and the
 * issuer's time zone. Mirrored by record_freight_invoice_service.
 */
export const CFDI_FUTURE_MARGIN_MS = 24 * 60 * 60 * 1000;
/** Mexico City's offset from UTC (no daylight saving time since 2022). */
const MEXICO_CITY_OFFSET_MS = 6 * 60 * 60 * 1000;

/**
 * Whether `Fecha` is a real date and time (no zone) within the plausible
 * range: from CFDI_MIN_ISSUED_AT to `now` plus CFDI_FUTURE_MARGIN_MS, read in
 * Mexico City. A date out of it (year 0100, 9999-12-31…) is not a CFDI the SAT
 * stamped, and one past 9999 in UTC cannot even be read back by the app.
 */
function isValidDateTime(value: string | undefined, now: Date): value is string {
  const match = DATE_TIME.exec(value ?? '');
  if (!match) return false;
  const [, y, mo, d, h, mi, s] = match.map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  // Years 0–99 are years 1900–1999 for Date.UTC; set the real year.
  date.setUTCFullYear(y);
  const real =
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d &&
    h < 24 &&
    mi < 60 &&
    s < 60;
  return (
    real &&
    (value as string) >= CFDI_MIN_ISSUED_AT &&
    date.getTime() + MEXICO_CITY_OFFSET_MS <= now.getTime() + CFDI_FUTURE_MARGIN_MS
  );
}

/** UTF-8 size of a string. */
function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * Reads a CFDI 4.0 of income (`TipoDeComprobante="I"`) in MXN with its stamp,
 * or says every reason it is not one. Never throws. `now` bounds its `Fecha`
 * (no later than a day past it).
 */
export function parseCfdi(xml: string, now: Date = new Date()): CfdiParseResult {
  if (xml.length > CFDI_XML_MAX_BYTES || utf8Length(xml) > CFDI_XML_MAX_BYTES) {
    return { ok: false, issues: ['too_large'] };
  }
  let root: XmlElement | null = null;
  let issuer: XmlElement | null = null;
  let receiver: XmlElement | null = null;
  let stamp: XmlElement | null = null;
  let duplicated = false;
  const isCfdi = (element: XmlElement | null, local: string) =>
    element?.namespace === CFDI_NAMESPACE && element.local === local;

  try {
    walkXml(xml, (element) => {
      if (!element.parent) {
        root = element;
        return;
      }
      if (element.parent === root && isCfdi(element, 'Emisor')) {
        duplicated ||= issuer !== null;
        issuer = element;
      } else if (element.parent === root && isCfdi(element, 'Receptor')) {
        duplicated ||= receiver !== null;
        receiver = element;
      } else if (
        element.namespace === TFD_NAMESPACE &&
        element.local === 'TimbreFiscalDigital' &&
        isCfdi(element.parent, 'Complemento') &&
        element.parent.parent === root
      ) {
        duplicated ||= stamp !== null;
        stamp = element;
      }
    });
  } catch (error) {
    if (error instanceof XmlError) return { ok: false, issues: [error.issue] };
    return { ok: false, issues: ['malformed'] };
  }
  if (duplicated) return { ok: false, issues: ['malformed'] };
  const comprobante = root as XmlElement | null;
  if (!comprobante || !isCfdi(comprobante, 'Comprobante'))
    return { ok: false, issues: ['not_cfdi'] };

  const attr = (element: XmlElement | null, name: string) =>
    (element as XmlElement | null)?.attributes.get(name);
  const issues: CfdiIssue[] = [];
  if (attr(comprobante, 'Version') !== '4.0') issues.push('version');
  if (attr(comprobante, 'TipoDeComprobante') !== 'I') issues.push('type');
  const currency = (attr(comprobante, 'Moneda') ?? '').trim();
  if (currency !== 'MXN') issues.push('currency');
  const totalCents = cfdiAmountCents(attr(comprobante, 'Total'));
  if (totalCents === null || totalCents <= 0) issues.push('total');
  const issuerRfc = cfdiRfc(attr(issuer, 'Rfc'));
  if (!issuerRfc) issues.push('issuer_rfc');
  const receiverRfc = cfdiRfc(attr(receiver, 'Rfc'));
  if (!receiverRfc) issues.push('receiver_rfc');
  const issuedAt = attr(comprobante, 'Fecha');
  if (!isValidDateTime(issuedAt, now)) issues.push('issued_at');
  const uuid = (attr(stamp, 'UUID') ?? '').trim().toLowerCase();
  if (!UUID.test(uuid)) issues.push('uuid');

  if (issues.length > 0 || !issuerRfc || !receiverRfc || totalCents === null || !issuedAt) {
    return { ok: false, issues };
  }
  const name = (element: XmlElement | null) => {
    const value = attr(element, 'Nombre')?.trim();
    return value ? value : null;
  };
  return {
    ok: true,
    cfdi: {
      uuid,
      issuerRfc,
      issuerName: name(issuer),
      receiverRfc,
      receiverName: name(receiver),
      totalCents,
      currency,
      issuedAt,
    },
  };
}

/** Whether the bytes start as a PDF does (`%PDF-`). */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}
