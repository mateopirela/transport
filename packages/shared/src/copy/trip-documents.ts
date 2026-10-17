// Checklist of a trip (D22, G3): the stages, who is responsible and the
// non-document items (photos and the signed delivery). Shared by the carrier
// app, the operator app and the shipper web. Document kinds take their label
// from tripDocumentKindLabels (catalogs.ts).
import type { TripChecklistResponsible, TripChecklistStage } from '../trip-checklist';

export const tripChecklistCopy = {
  title: 'Documentos del viaje',
  help: 'Lo que el viaje necesita, por etapa. Lo que falta se avisa; no detiene la salida (D22).',
  stages: {
    before_departure: 'Antes de salir',
    pickup: 'Al recoger',
    delivery: 'Al entregar',
    billing: 'Para cobrar',
  } satisfies Record<TripChecklistStage, string>,
  /** Stage names that are not in the catalog yet (new data): shown as stored. */
  unknownStage: (stage: string) => stage,
  responsible: {
    shipper: 'Cliente',
    carrier: 'Transportista',
    operator: 'Operador',
  } satisfies Record<TripChecklistResponsible, string>,
  /** Checklist codes that are not document kinds. */
  items: {
    pickup_evidence: 'Evidencia de recolección (fotos)',
    delivery_evidence: 'Evidencia de entrega (fotos)',
    delivery_receipt: 'Entrega firmada (quién recibió)',
  } as Record<string, string>,
  done: (at: string) => `Listo · ${at}`,
  pending: 'Pendiente',
  optional: 'Opcional',
  required: 'Obligatorio',
  pendingCount: (n: number) =>
    n === 0 ? 'Todo listo' : n === 1 ? '1 pendiente' : `${n} pendientes`,
} as const;
