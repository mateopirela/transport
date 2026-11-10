// Cargo insurance of the shipper (I1, D35-E1): the trip screens of the
// shipper (web) and of the carrier staff (web and app), and the shipper's
// "Documentos de la empresa". The trip document kind and the notification
// take their text from catalogs.ts and notifications.ts.
import type { CargoInsuranceState } from '../cargo-insurance';

export const cargoInsuranceCopy = {
  title: 'Seguro de la mercancía',
  shipperHelp:
    'Antes de cada viaje compruebas el seguro de tu mercancía: tu póliza anual vigente o la póliza o el certificado de este viaje. La plataforma no responde por robo, daños ni accidentes.',
  carrierHelp:
    'El cliente asegura su mercancía y la comprueba antes de salir. Aquí ves si está cubierta; la póliza es del cliente.',
  state: {
    trip_policy: (date: string) => `Póliza del viaje subida el ${date}`,
    annual_policy: (date: string) => `Cubierto por la póliza anual, vence el ${date}`,
    missing: 'Falta comprobar el seguro',
    not_required: 'No se pide para este viaje',
  },
  pill: {
    trip_policy: 'Cubierto',
    annual_policy: 'Cubierto',
    missing: 'Falta',
    not_required: 'No se pide',
  } satisfies Record<CargoInsuranceState['kind'], string>,
  blocks: 'Sin seguro, el viaje no puede salir.',
  warnsOnly: 'Lo que falta se avisa; no detiene la salida.',
  upload: 'Subir la póliza del viaje',
  uploaded: 'Listo. La póliza del viaje quedó guardada.',
  annualHint:
    'Si tienes una póliza anual, súbela una vez en Documentos de la empresa y cubrirá tus viajes mientras esté vigente.',
  annualLink: 'Ir a Documentos de la empresa',
} as const;

/** "Documentos de la empresa" of an approved shipper (I1). */
export const shipperCompanyCopy = {
  nav: 'Empresa',
  title: 'Documentos de la empresa',
  description:
    'Los documentos de tu empresa y su verificación. Aquí subes tu póliza anual del seguro de la mercancía: una vez aprobada, cubre tus viajes hasta que vence.',
} as const;
