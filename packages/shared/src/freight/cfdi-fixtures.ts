// Synthetic CFDI 4.0 for the tests (Vitest, Deno and Playwright). Made-up
// RFCs, names and UUIDs: no real taxpayer's data. No imports, so Deno can
// load this file as it is.

export interface SyntheticCfdiOptions {
  issuerRfc?: string;
  issuerName?: string;
  receiverRfc?: string;
  receiverName?: string;
  /** As written in the XML, e.g. "9700.00". */
  total?: string;
  currency?: string;
  version?: string;
  type?: string;
  /** `Fecha`, local time without a zone. */
  issuedAt?: string;
  uuid?: string;
  /** Without the TimbreFiscalDigital (not stamped). */
  unstamped?: boolean;
  /** Namespace prefixes (default `cfdi` and `tfd`). */
  cfdiPrefix?: string;
  tfdPrefix?: string;
}

export const SYNTHETIC_UUID = '6f3a1b2c-4d5e-4f60-8a7b-9c0d1e2f3a4b';

/** A minimal stamped CFDI of income: one concept, the transfer of the IVA left out. */
export function syntheticCfdi(options: SyntheticCfdiOptions = {}): string {
  const c = options.cfdiPrefix ?? 'cfdi';
  const t = options.tfdPrefix ?? 'tfd';
  const total = options.total ?? '9700.00';
  const stamp = options.unstamped
    ? ''
    : `<${c}:Complemento><${t}:TimbreFiscalDigital xmlns:${t}="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" UUID="${
        options.uuid ?? SYNTHETIC_UUID
      }" FechaTimbrado="2026-11-06T10:05:00" RfcProvCertif="SPR190613I52" SelloCFD="QUJD" NoCertificadoSAT="00001000000000000000" SelloSAT="QUJD"/></${c}:Complemento>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<${c}:Comprobante xmlns:${c}="http://www.sat.gob.mx/cfd/4" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" Version="${
    options.version ?? '4.0'
  }" Serie="F" Folio="101" Fecha="${options.issuedAt ?? '2026-11-06T10:00:00'}" FormaPago="99" MetodoPago="PPD" SubTotal="${total}" Moneda="${
    options.currency ?? 'MXN'
  }" Total="${total}" TipoDeComprobante="${options.type ?? 'I'}" Exportacion="01" LugarExpedicion="64000">
  <${c}:Emisor Rfc="${options.issuerRfc ?? 'FLI040404CD4'}" Nombre="${options.issuerName ?? 'FLETES DE PRUEBA'}" RegimenFiscal="601"/>
  <${c}:Receptor Rfc="${options.receiverRfc ?? 'FUL201015AB1'}" Nombre="${options.receiverName ?? 'RECEPTOR DE PRUEBA'}" DomicilioFiscalReceptor="64000" RegimenFiscalReceptor="601" UsoCFDI="G03"/>
  <${c}:Conceptos>
    <${c}:Concepto ClaveProdServ="78101802" Cantidad="1" ClaveUnidad="E48" Descripcion="Servicio de flete" ValorUnitario="${total}" Importe="${total}" ObjetoImp="01"/>
  </${c}:Conceptos>
  ${stamp}
</${c}:Comprobante>
`;
}
