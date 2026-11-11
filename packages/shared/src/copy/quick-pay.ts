// Quick pay (I4, D38): the carrier asks Fulmis to be paid before the
// client's terms, for a fee; the admin approves or rejects each request.
// Cobranza (app and web) and /admin/flete.

/** Why the carrier's CFDI to Fulmis does not allow the quick pay (QuickPayInvoiceBlocker). */
const invoiceBlockerTexts = {
  invoice_missing: 'Sube tu CFDI a Fulmis para pedir pago rápido.',
  fulmis_rfc_missing:
    'Tu CFDI quedó "Sin validar" porque Fulmis aún no tiene su RFC. Podrás pedir pago rápido en cuanto lo capture.',
  invoice_unvalidated:
    'Tu CFDI quedó "Sin validar": no está a nombre del RFC de Fulmis. Escríbenos por soporte para corregirlo y pedir pago rápido.',
} as const;

/**
 * Why a trip cannot ask for the quick pay (QuickPayBlocker), as Cobranza
 * says it. Null: nothing to say (its status already tells, or the trip is
 * still on its way).
 */
export const quickPayBlockerLabels = {
  not_open: null,
  partially_paid: 'Sin pago rápido: Fulmis ya te pagó una parte de este viaje.',
  not_delivered: null,
  ...invoiceBlockerTexts,
} as const;

export const quickPayCopy = {
  title: 'Pago rápido',
  /** Cobranza (carrier). */
  carrier: {
    help: 'Cobra antes del plazo del cliente. Fulmis te paga el neto menos la tarifa de pago rápido, una vez que el administrador lo apruebe.',
    request: 'Pedir pago rápido',
    fee: (percent: string) => `Tarifa de pago rápido (${percent})`,
    receive: 'Recibes',
    confirm: 'Confirmar pago rápido',
    confirmTitle: '¿Pedir pago rápido?',
    confirmBody: (net: string, fee: string, quickNet: string) =>
      `De tu neto de ${net}, Fulmis descuenta ${fee} y te paga ${quickNet} cuando el administrador lo apruebe.`,
    cancel: 'Cancelar',
    submitting: 'Enviando…',
    requested: (quickNet: string) =>
      `Pago rápido solicitado: recibirás ${quickNet} cuando el administrador lo apruebe.`,
    approved: (quickNet: string) => `Pago rápido aprobado: Fulmis te paga ${quickNet}.`,
    rejected: (reason: string) => `Tu solicitud de pago rápido fue rechazada: ${reason}`,
    feeUnavailable: 'No pudimos consultar la tarifa de pago rápido. Intenta de nuevo.',
  },
  /** /admin/flete. */
  admin: {
    filter: 'Pago rápido',
    settings: 'Pago rápido',
    feeLabel: 'Tarifa de pago rápido',
    feeHelp:
      'En puntos base sobre el neto del transportista: 250 = 2.5 %. De 250 a 9999. Cada solicitud congela la tarifa al pedirse.',
    limitLabel: 'Límite de exposición (MXN)',
    limitHelp:
      'Lo aprobado en pago rápido que el cliente todavía no paga. Vacío: sin límite automático (cada solicitud se aprueba igual).',
    saveSettings: 'Guardar pago rápido',
    settingsSaved: 'Listo: quedó guardado.',
    exposure: 'Exposición del pago rápido',
    exposureLine: (exposure: string, limit: string | null) =>
      limit === null ? `${exposure} · sin límite` : `${exposure} de ${limit}`,
    requested: (date: string) => `Pago rápido solicitado el ${date}`,
    approved: (date: string) => `Pago rápido aprobado el ${date}`,
    rejected: (date: string, reason: string) => `Pago rápido rechazado el ${date}: ${reason}`,
    fee: (percent: string) => `Tarifa (${percent})`,
    quickNet: 'Neto rápido',
    clientUnchanged: 'El cobro al cliente no cambia: Fulmis asume el riesgo.',
    overLimit: (projected: string, limit: string) =>
      `Con esta aprobación la exposición sería ${projected}, más que el límite de ${limit}.`,
    confirmOverLimit: 'Aprobar aunque pase el límite',
    approve: 'Aprobar pago rápido',
    approvedDone: 'Listo: el pago rápido quedó aprobado y programado.',
    reject: 'Rechazar',
    rejectReason: 'Motivo del rechazo',
    rejectReasonHelp: 'Lo verá el transportista. Hasta 500 caracteres.',
    rejectSubmit: 'Rechazar solicitud',
    rejectedDone: 'Listo: la solicitud quedó rechazada.',
    /** Why a pending request cannot be approved: the carrier's CFDI (QuickPayInvoiceBlocker). */
    invoiceBlockers: {
      invoice_missing:
        'No se puede aprobar: el transportista no ha subido su CFDI a Fulmis. Recházala con el motivo.',
      fulmis_rfc_missing:
        'No se puede aprobar: el CFDI del transportista está "Sin validar" porque falta el RFC de Fulmis. Captúralo en Ajustes (el CFDI a su nombre queda validado) o recházala con el motivo.',
      invoice_unvalidated:
        'No se puede aprobar: el CFDI del transportista está "Sin validar" porque no está a nombre del RFC de Fulmis. Recházala con el motivo.',
    },
  },
  errors: {
    notAllowed: 'No puedes pedir el pago rápido de este viaje.',
    feeChanged: 'La tarifa de pago rápido cambió. Revisa el nuevo monto y vuelve a confirmar.',
    /** request_quick_pay refused (55000): the reason in its detail (QuickPayBlocker). */
    blockers: {
      not_open: 'Este viaje ya no admite pago rápido.',
      partially_paid: 'Este viaje ya no admite pago rápido: Fulmis ya te pagó una parte.',
      not_delivered:
        'Podrás pedir pago rápido cuando el viaje esté entregado, con su evidencia firmada.',
      ...invoiceBlockerTexts,
    },
    notRequested: 'Esta solicitud ya se resolvió.',
    overLimit:
      'Esta aprobación pasa el límite de exposición. Marca "Aprobar aunque pase el límite" para confirmarla.',
    reason: 'Escribe un motivo de hasta 500 caracteres.',
    fee: 'La tarifa va de 250 a 9999 puntos base.',
    limit: 'Escribe un límite mayor a cero, con hasta dos decimales, o déjalo vacío.',
    pendingRequest: 'Hay una solicitud de pago rápido pendiente: apruébala o recházala primero.',
    generic: 'No se pudo completar. Intenta de nuevo.',
  },
} as const;
