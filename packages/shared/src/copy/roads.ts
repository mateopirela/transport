// Spanish copy of road intelligence (H4, D31): the suggested route of a load,
// the tolls and risk warnings, the carrier's preferred and avoided segments,
// the axles of a unit and the admin catalog.
import { formatCalendarDate, formatMxn } from '../formatters';
import type {
  RoadDataStatus,
  RoadPreference,
  RoadRiskLevel,
  TollVehicleClass,
} from '../roads/catalog';
import type { RiskWarning, RoadSuggestion, SuggestedRoute } from '../roads/suggest';
import { formatMxnWhole } from './matching';

export const roadRiskLevelLabels: Record<RoadRiskLevel, string> = {
  low: 'bajo',
  medium: 'medio',
  high: 'alto',
};

export const roadDataStatusLabels: Record<RoadDataStatus, string> = {
  estimated: 'estimado',
  verified: 'verificado',
};

export const roadPreferenceLabels: Record<RoadPreference, string> = {
  prefer: 'Preferir',
  avoid: 'Evitar',
};

export const tollClassLabels: Record<TollVehicleClass, string> = {
  c2: 'C2 · 2 ejes',
  c3: 'C3 · 3 ejes',
  c4: 'C4 · 4 ejes',
  c5: 'C5 · 5 ejes',
  c6: 'C6 · 6 ejes',
  c7: 'C7 · 7 ejes',
  c8: 'C8 · 8 ejes',
  c9: 'C9 · 9 ejes',
};

/** "todo el día", "de noche" (a band inside 18:00–7:00 crossing midnight) or "de 10:00 a 16:00". */
export function hourBandLabel(fromHour: number, toHour: number): string {
  if (fromHour === 0 && toHour === 24) return 'todo el día';
  if (fromHour > toHour && fromHour >= 18 && toHour <= 7) return 'de noche';
  return `de ${fromHour}:00 a ${toHour}:00`;
}

/** e.g. "Tramo con riesgo alto de noche: Lagos de Moreno – Zapotlanejo (robo a transporte)". */
export function riskWarningText(
  w: Pick<RiskWarning, 'level' | 'fromHour' | 'toHour' | 'segmentName' | 'description'>,
): string {
  return `Tramo con riesgo ${roadRiskLevelLabels[w.level]} ${hourBandLabel(w.fromHour, w.toHour)}: ${w.segmentName} (${w.description})`;
}

/** "$1,059.00", "desde $748.00" when some tariff is missing, or "Sin dato". */
export function tollsAmount(route: Pick<SuggestedRoute, 'tollsCents' | 'tollsMissing'>): string {
  if (route.tollsMissing && route.tollsCents === 0) return roadsCopy.noData;
  return `${route.tollsMissing ? 'desde ' : ''}${formatMxn(route.tollsCents)}`;
}

/** "Casetas estimadas: $1,059.00" (see tollsAmount). */
export function tollsText(route: Pick<SuggestedRoute, 'tollsCents' | 'tollsMissing'>): string {
  return `${roadsCopy.tolls}: ${tollsAmount(route)}`;
}

/** What a recommendation card says of its road: "Casetas ~$748", "Casetas: sin dato" or nothing. */
export function cardRoad(road: RoadSuggestion | undefined): {
  tolls: string | null;
  risky: boolean;
} {
  if (road?.source !== 'catalog') return { tolls: null, risky: false };
  const tolls =
    road.tollsCents > 0
      ? roadsCopy.cardTolls(formatMxnWhole(road.tollsCents))
      : road.tollsMissing
        ? roadsCopy.cardTollsUnknown
        : null;
  return { tolls, risky: road.highRiskCount > 0 };
}

export const roadsCopy = {
  section: 'Ruta sugerida',
  none: 'Sin ruta en el catálogo',
  noneHint: 'Todavía no tenemos tramos de carretera para este recorrido.',
  tolls: 'Casetas estimadas',
  noData: 'Sin dato',
  tollsMissing: 'Faltan tarifas de algunos tramos; el total es un mínimo.',
  tollClass: (label: string) => `Tarifa de camión ${label}`,
  /** "estimado · CAPUFE …, 13 abr 2026". */
  source: (status: RoadDataStatus, source: string, date: string) =>
    `${roadDataStatusLabels[status]} · ${source}, ${formatCalendarDate(date)}`,
  distance: (km: string) => `${km} por carretera (estimado)`,
  segmentToll: (amount: string) => `Caseta ${amount}`,
  segmentPass: (time: string) => `Paso estimado ${time}`,
  usesAvoided: 'Todas las rutas del catálogo usan un tramo que marcaste como "evitar".',
  preferred: 'Tramo preferido',
  avoided: 'Tramo a evitar',
  noRisks: 'Sin avisos de inseguridad a la hora de paso.',
  /** Recommendation card. */
  cardTolls: (amount: string) => `Casetas ~${amount}`,
  cardTollsUnknown: 'Casetas: sin dato',
  cardHighRisk: 'Tramo inseguro',
  cardHighRiskLabel: 'Tramo con riesgo alto a la hora de paso',
  preferences: {
    sectionTitle: 'Tramos preferidos y a evitar',
    forRoute: (route: string) => `Tramos de ${route}`,
    preferredTitle: 'Tramos preferidos',
    avoidedTitle: 'Tramos a evitar',
    empty: 'Ninguno',
    add: 'Agregar tramo',
    segmentLabel: 'Tramo',
    segmentRequired: 'Elige un tramo.',
    kindLabel: 'Preferencia',
    remove: 'Quitar',
    save: 'Guardar tramo',
    saved: 'Tramo guardado.',
    removed: 'Tramo quitado.',
    noCatalog: 'No hay tramos del catálogo cerca de esta ruta.',
    hint: 'La ruta sugerida evita los tramos marcados y prefiere los preferidos.',
  },
  axles: {
    label: 'Ejes del camión',
    hint: (n: number) =>
      `Con remolque, si aplica. Decide la tarifa de casetas. Si lo dejas vacío usamos ${n} ejes.`,
    value: (n: number) => `${n} ejes`,
    defaulted: (n: number) => `${n} ejes (por omisión)`,
  },
  admin: {
    title: 'Carreteras',
    description:
      'Tramos, casetas, inseguridad y corredores que usa la ruta sugerida. Cada dato lleva su fuente y fecha; lo que no tiene fuente queda "Sin dato".',
    corridors: 'Corredores',
    segments: 'Tramos',
    tollsTitle: 'Casetas por clase',
    risksTitle: 'Inseguridad',
    columns: {
      code: 'Clave',
      name: 'Nombre',
      highway: 'Carretera',
      distance: 'Distancia',
      toll: 'Cuota',
      source: 'Fuente',
      status: 'Estado',
      segments: 'Tramos',
      level: 'Nivel',
      band: 'Horario',
      description: 'Descripción',
      amount: 'Tarifa',
      class: 'Clase',
      validFrom: 'Vigente desde',
      actions: 'Acciones',
    },
    yes: 'Sí',
    no: 'No',
    archived: 'Archivado',
    empty: 'Todavía no hay datos en el catálogo.',
    noRisks: 'Sin riesgos registrados.',
    form: {
      editSegment: 'Editar tramo',
      newSegment: 'Nuevo tramo',
      code: 'Clave (p. ej. SLP-LAG)',
      name: 'Nombre',
      highway: 'Carretera',
      fromCity: 'Ciudad de inicio',
      fromState: 'Estado de inicio',
      fromLat: 'Latitud de inicio',
      fromLng: 'Longitud de inicio',
      toCity: 'Ciudad final',
      toState: 'Estado final',
      toLat: 'Latitud final',
      toLng: 'Longitud final',
      distanceKm: 'Distancia (km)',
      isToll: 'Cobra casetas',
      notes: 'Notas',
      source: 'Fuente',
      sourceUrl: 'Enlace de la fuente (https)',
      sourceDate: 'Fecha de la fuente',
      dataStatus: 'Estado del dato',
      archived: 'Archivar',
      setToll: 'Guardar tarifa',
      tollAmount: 'Tarifa en pesos (vacío = sin dato)',
      tollClass: 'Clase',
      validFrom: 'Vigente desde',
      newRisk: 'Nuevo aviso de inseguridad',
      level: 'Nivel',
      fromHour: 'Desde la hora (0–23)',
      toHour: 'Hasta la hora (1–24)',
      description: 'Descripción (p. ej. robo a transporte de carga)',
      observedOn: 'Fecha de la observación',
      archiveRisk: 'Archivar aviso',
      save: 'Guardar',
      saved: 'Cambios guardados.',
      corridorSegments: 'Claves de los tramos, en orden y separadas por comas',
      newCorridor: 'Nuevo corredor',
      editCorridor: 'Editar corredor',
      originCity: 'Ciudad de origen',
      originState: 'Estado de origen',
      originLat: 'Latitud de origen',
      originLng: 'Longitud de origen',
      originRadius: 'Radio de origen (km)',
      destinationCity: 'Ciudad de destino',
      destinationState: 'Estado de destino',
      destinationLat: 'Latitud de destino',
      destinationLng: 'Longitud de destino',
      destinationRadius: 'Radio de destino (km)',
      bidirectional: 'En ambos sentidos',
    },
    errors: {
      invalid: 'Revisa los datos: la fuente y su fecha son obligatorias y las horas van de 0 a 24.',
      unknownSegment:
        'Alguna clave de tramo no existe, está archivada o los tramos no se conectan en orden.',
      duplicate: 'Ya existe un registro con esa clave.',
      generic: 'No se pudo guardar. Intenta de nuevo.',
    },
  },
};
