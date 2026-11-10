// Pilot support by WhatsApp (I2, D41) and the hombre-camión's documents in
// one screen (I2, D16-E2).

export const supportCopy = {
  help: 'Ayuda',
  helpSubtitle: 'Escríbenos por WhatsApp',
  /** Under "Ayuda" when the admin set the hours. */
  hours: (hours: string) => `Horario: ${hours}`,
  /** Inside a trip: the folio goes in the message. */
  helpWithTrip: (folio: string) => `Ayuda con el viaje ${folio}`,
  /** The message WhatsApp opens with: who writes and, inside a trip, which one. */
  message: (roleLabel: string | null, folio: string | null) =>
    [
      'Hola, necesito ayuda con la plataforma de transporte.',
      roleLabel ? `Soy ${roleLabel}.` : null,
      folio ? `Viaje ${folio}.` : null,
    ]
      .filter(Boolean)
      .join(' '),
  /** The role a hombre-camión (a Gerente who drives, D13) writes as. */
  ownerOperatorRole: 'Hombre camión',
  folio: (folio: string) => `Folio ${folio}`,
} as const;

export const adminSettingsCopy = {
  nav: 'Ajustes',
  title: 'Ajustes',
  description: 'Ajustes de la plataforma. Cada cambio queda en la bitácora.',
  sections: {
    support: 'Soporte',
  },
  supportHelp:
    'El WhatsApp de soporte de la prueba piloto. Sin número, "Ayuda" no aparece en la app ni en la web.',
  whatsappLabel: 'WhatsApp de soporte',
  whatsappHint: '10 dígitos o con lada internacional, p. ej. +52 81 1234 5678.',
  whatsappNone: 'Sin número: "Ayuda" no aparece.',
  whatsappCurrent: (phone: string) => `"Ayuda" abre WhatsApp con el ${phone}.`,
  hoursLabel: 'Horario de atención (opcional)',
  hoursHint: 'Se muestra bajo "Ayuda", p. ej. "Lunes a sábado, 8:00 a 20:00".',
  save: 'Guardar',
  clear: 'Quitar',
  saved: 'Ajuste guardado.',
  errors: {
    notAdmin: 'Solo un administrador puede cambiar los ajustes.',
    invalidPhone: 'Escribe un teléfono válido: 10 dígitos o con lada internacional (+).',
    invalidHours: 'Escribe el horario en 200 caracteres o menos.',
    generic: 'No pudimos guardar el ajuste. Intenta de nuevo.',
  },
} as const;

export const ownerOperatorDocumentsCopy = {
  title: 'Mis documentos',
  subtitle:
    'Todo lo que pedimos a un hombre camión en un solo lugar: los de tu empresa, los tuyos como operador y los de cada camión.',
  groups: {
    company: 'Empresa',
    personal: 'Personales',
    vehicle: (label: string) => `Camión ${label}`,
  },
  fiscal: {
    legalName: 'Razón social',
    rfc: 'RFC',
    address: 'Domicilio fiscal',
  },
  noOperator: 'No encontramos tu registro como operador. Escríbenos para revisarlo.',
  noVehicles: 'Aún no registras camiones. Agrégalos en Unidades para subir sus documentos.',
} as const;
