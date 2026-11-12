// Spanish copy of the trip document gate (R4, D45): no unit and no operator
// travels without every required document approved and current. Shared by
// the web and the app: fleet lists, the assignment form and the errors of
// assign_trip, set_vehicle_availability and release_vehicle.

export const documentGateCopy = {
  /**
   * Names of the catalog codes the server puts in its errors (D16, D44). The
   * catalog (document_requirements.name) stays the source on the screens that
   * read it; these only translate an error message.
   */
  requirementNames: {
    vehicle_registration_card: 'Tarjeta de circulación',
    vehicle_insurance_policy: 'Seguro vigente',
    vehicle_permit: 'Permisos correspondientes',
    federal_driver_license: 'Licencia de conducir vigente',
    operator_official_id: 'Identificación oficial',
    operator_selfie: 'Selfie',
  } as Readonly<Record<string, string>>,
  /** A code the app does not know yet (a catalog row added later). */
  otherRequirement: 'un documento obligatorio',
  /** The last separator of a list: "A, B y C". */
  and: 'y',
  /** …before a word that starts with the sound "i": "A e Identificación". */
  andBeforeI: 'e',
  unit: {
    expired: (names: string) => `Venció: ${names}.`,
    notApproved: (names: string) => `Falta aprobar: ${names}.`,
  },
  operator: {
    /** The license alone (JP: "La licencia de <operador> venció"). */
    licenseExpired: (operator: string) => `La licencia de ${operator} venció.`,
    expired: (names: string, operator: string) => `Venció: ${names} de ${operator}.`,
    notApproved: (names: string, operator: string) => `Falta aprobar: ${names} de ${operator}.`,
  },
  /** What follows the reason in an error, by where it happened. */
  errors: {
    assignUnit: 'Elige otra unidad o espera a que los documentos estén aprobados y vigentes.',
    assignOperator: 'Elige otro operador o espera a que sus documentos estén aprobados y vigentes.',
    availability:
      'Cuando los documentos estén aprobados y vigentes podrás marcar la unidad como disponible.',
  },
  fleet: {
    /** Column of the operators table. */
    column: 'Viajes',
    canTravel: 'Puede viajar',
    cannotTravel: 'No puede viajar',
  },
  assign: {
    /** Tag of a unit or an operator in the assignment lists. */
    notReadyTag: 'Documentos sin aprobar',
  },
} as const;
