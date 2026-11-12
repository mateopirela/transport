// Freight invoices (I5, D37): the carrier's CFDI to Fulmis (Cobranza), Fulmis'
// CFDI to the client (uploaded by the admin while there is no PAC; Cartera)
// and Fulmis' fiscal data (/admin/ajustes).

export const freightInvoiceValidationLabels = {
  validated: 'Validado',
  unvalidated: 'Sin validar',
} as const;

/** Why a CFDI was not taken; one line per reason (codes of FreightInvoiceFailure). */
export const freightInvoiceFailureLabels = {
  too_large: 'El XML pesa más de 1 MB.',
  malformed: 'El archivo no es un XML válido.',
  dtd: 'El XML trae una declaración DOCTYPE o ENTITY, que no se acepta.',
  not_cfdi: 'El XML no es un CFDI (falta el nodo cfdi:Comprobante de la versión 4.0).',
  version: 'El CFDI debe ser de la versión 4.0.',
  type: 'El CFDI debe ser de ingreso (tipo de comprobante "I").',
  currency: 'La moneda del CFDI debe ser MXN.',
  total: 'El total del CFDI no es un monto válido.',
  issuer_rfc: 'El RFC del emisor falta o no es válido.',
  receiver_rfc: 'El RFC del receptor falta o no es válido.',
  issued_at: 'La fecha del CFDI falta o no es válida.',
  uuid: 'El CFDI no está timbrado: falta el folio fiscal (UUID) del timbre.',
  issuer_mismatch: 'El emisor no es quien factura este viaje (revisa el RFC del emisor).',
  receiver_mismatch:
    'El receptor no es el que corresponde a este viaje (revisa el RFC del receptor).',
  total_mismatch: 'El total no coincide con el monto del viaje.',
  uuid_taken: 'Ese folio fiscal (UUID) ya se registró en la plataforma.',
  already_invoiced: 'Este viaje ya tiene su CFDI registrado.',
  trip_cancelled: 'El viaje se canceló: no se factura.',
  terms_missing: 'El cliente no tiene plazo de pago: fíjalo antes de registrar su factura.',
  xml_missing: 'Elige el XML del CFDI.',
  pdf_missing: 'Elige el PDF del CFDI.',
  pdf_invalid: 'El PDF no es un archivo PDF válido.',
  pdf_too_large: 'El PDF pesa más de 5 MB.',
} as const;

export const freightInvoicesCopy = {
  /** "Folio fiscal 1A2B… · 6 nov 2026". */
  invoiceLine: (uuid: string, date: string) => `Folio fiscal ${uuid.toUpperCase()} · ${date}`,
  /** In place of the date when a stored CFDI's date cannot be read. */
  invalidIssuedAt: 'fecha no válida',
  downloadPdf: 'PDF',
  downloadXml: 'XML',
  download: (kind: string) => `Descargar ${kind}`,
  downloadUnavailable: 'Esta factura no está disponible.',
  /** Fulmis' fiscal data, as the carrier reads it to invoice Fulmis. */
  fulmis: {
    title: 'Factura a Fulmis',
    help: 'Por cada viaje, factúrale a Fulmis el neto y sube aquí el XML y, si quieres, el PDF.',
    rfc: 'RFC',
    legalName: 'Razón social',
    taxRegime: 'Régimen fiscal',
    zip: 'Código postal',
    inProcess:
      'Los datos fiscales de Fulmis están en proceso. Puedes subir tu CFDI: quedará "Sin validar" hasta que Fulmis tenga su RFC.',
  },
  /** The carrier's CFDI to Fulmis (Cobranza, app and web). */
  carrier: {
    column: 'CFDI',
    missing: 'Falta tu CFDI',
    upload: 'Subir CFDI',
    xml: 'XML del CFDI',
    pdf: 'PDF (opcional)',
    pickXml: 'Elegir XML',
    pickPdf: 'Agregar PDF (opcional)',
    submit: 'Enviar CFDI',
    submitting: 'Validando…',
    done: 'Listo: tu CFDI quedó registrado.',
    doneUnvalidated: 'Listo: tu CFDI quedó guardado "Sin validar" hasta que Fulmis tenga su RFC.',
    rules: 'Emisor: tu RFC. Receptor: Fulmis. Total: el neto del viaje. Moneda: MXN.',
  },
  /** Fulmis' CFDI to the client (Cartera). */
  client: {
    none: 'Por emitir',
  },
  /** Admin: /admin/flete. */
  admin: {
    clientInvoice: 'Factura al cliente',
    carrierInvoice: 'CFDI del transportista',
    noClientInvoice: 'Sin factura',
    noCarrierInvoice: 'El transportista no ha subido su CFDI.',
    upload: 'Subir factura emitida',
    manualHelp:
      'La emisión desde la plataforma está apagada (sin PAC): emite el CFDI por fuera y sube aquí el XML y el PDF. Receptor: el RFC del cliente. Total: el flete.',
    xml: 'XML del CFDI',
    pdf: 'PDF del CFDI',
    submit: 'Subir factura',
    submitting: 'Validando…',
    /** The dialog before the upload (§1.5: every "Registrar" of the admin asks first). */
    confirmTitle: '¿Subir la factura del cliente?',
    confirmBody:
      'Si el XML pasa la validación, la factura queda registrada en este viaje y el cliente la ve en Cartera.',
    confirmSubmit: 'Sí, subir factura',
    done: 'Listo: la factura quedó registrada y el cliente ya la ve en Cartera.',
    doneUnvalidated:
      'Listo: la factura quedó registrada "Sin validar" (falta el RFC de Fulmis en Ajustes) y el cliente ya la ve en Cartera.',
    termsFirst: 'Fija el plazo de pago del cliente antes de registrar su factura.',
  },
  /** Admin: /admin/ajustes. */
  settings: {
    section: 'Datos fiscales de Fulmis',
    help: 'Los usa la plataforma para validar los CFDI: el emisor de las facturas a los clientes y el receptor de las de los transportistas. Vacíos, los CFDI se guardan "Sin validar".',
    rfcLabel: 'RFC',
    rfcHint: '12 caracteres (persona moral), p. ej. FUL201015AB1.',
    legalNameLabel: 'Razón social',
    legalNameHint: 'Como aparece en la Constancia de Situación Fiscal.',
    taxRegimeLabel: 'Régimen fiscal',
    taxRegimeHint: 'Clave del SAT de tres dígitos, p. ej. 601.',
    zipLabel: 'Código postal del domicilio fiscal',
    zipHint: 'Cinco dígitos.',
    invalid: {
      rfc: 'Escribe un RFC válido.',
      legalName: 'Escribe la razón social en 300 caracteres o menos.',
      taxRegime: 'Escribe la clave del régimen fiscal: tres dígitos.',
      zip: 'Escribe el código postal: cinco dígitos.',
    },
  },
  errors: {
    notAllowed: 'No puedes subir la factura de este viaje.',
    rateLimited: 'Subiste muchas facturas seguidas. Espera un minuto e intenta de nuevo.',
    generic: 'No pudimos subir la factura. Intenta de nuevo.',
  },
} as const;
