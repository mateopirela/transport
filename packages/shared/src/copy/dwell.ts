// Spanish copy of the waiting times at loading and unloading sites (H5,
// D32): the typical time at a site, the estimated end of unloading and what
// it is based on.
import type { DwellBasis, DwellEstimate, TripEndEstimate } from '../dwell';

const trips = (n: number) => (n === 1 ? '1 viaje' : `${n} viajes`);

/** "~45 min", "~3 h", "~2 h 30 min": rounded to 5 minutes, or to half hours from 1 h. */
export function formatDwellDuration(minutes: number): string {
  if (minutes < 60) return `~${Math.max(5, Math.round(minutes / 5) * 5)} min`;
  const halves = Math.round(minutes / 30);
  const hours = Math.floor(halves / 2);
  return halves % 2 === 0 ? `~${hours} h` : `~${hours} h 30 min`;
}

/** The time at a site and how many trips it comes from: "~5 h (12 viajes)", "~4 h (valor por defecto)". */
export function formatDwell(estimate: DwellEstimate): string {
  const duration = formatDwellDuration(estimate.totalMedianMinutes);
  return estimate.basis === 'default'
    ? `${duration} (valor por defecto)`
    : `${duration} (${trips(estimate.sampleSize)})`;
}

const basisText: Record<Exclude<DwellBasis, 'default'>, (n: number) => string> = {
  site_hour: (n) => `Según ${trips(n)} en este sitio a esta hora`,
  site: (n) => `Según ${trips(n)} en este sitio`,
  shipper: (n) => `Según ${trips(n)} a los sitios de este cliente`,
};

export const dwellCopy = {
  /** Return-trip card: the time at the delivery the unit is finishing. */
  returnTrip: (estimate: DwellEstimate) => `Espera típica en descarga: ${formatDwell(estimate)}`,
  /** Load detail ("Ruta sugerida"): the time at its pickup. */
  pickup: (estimate: DwellEstimate) => `Espera típica al cargar: ${formatDwell(estimate)}`,
  /** Shipper: its own sites. */
  siteTitle: 'Tiempo típico en tu sitio',
  siteHint: 'Espera y maniobra de tus viajes anteriores en el mismo sitio.',
  sitePickup: 'Carga',
  siteDelivery: 'Descarga',
  /** Operator, at the start of unloading: where the suggested end comes from. */
  unloadSuggestion: (estimate: DwellEstimate) =>
    estimate.basis === 'default'
      ? 'Te sugerimos 4 h, el valor por defecto: aún no hay suficientes viajes medidos en este sitio.'
      : `Te sugerimos la descarga típica en este sitio, ${formatDwellDuration(
          estimate.handlingMedianMinutes ?? estimate.totalMedianMinutes,
        )} (${trips(estimate.sampleSize)}). Cámbiala si sabes otra hora.`,
  /** Estimated end of unloading of a trip. */
  tripEnd: 'Fin estimado de descarga',
  /** What the estimated end is based on; null once unloading finished. */
  tripEndBasis(estimate: TripEndEstimate): string | null {
    switch (estimate.source) {
      case 'finished':
        return null;
      case 'operator':
        return 'Estimado del operador';
      case 'default':
        return 'Con el valor por defecto: 4 h en el sitio';
      case 'measured':
        return estimate.basis && estimate.basis !== 'default' && estimate.sampleSize
          ? basisText[estimate.basis](estimate.sampleSize)
          : null;
    }
  },
};
