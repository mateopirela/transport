// Spanish copy of the recommendations (B08): the one-line explanation of a
// match, e.g. "45 km en vacío · $38/km · coincide con tu ruta MTY–GDL".
import { APP_CURRENCY, APP_LOCALE } from '../constants';
import { formatDistance } from '../formatters';
import type { MatchBreakdown } from '../matching/scoring';

// Price per km and toll estimates are for display only: whole pesos read better.
const mxnWhole = new Intl.NumberFormat(APP_LOCALE, {
  style: 'currency',
  currency: APP_CURRENCY,
  maximumFractionDigits: 0,
});

/** Short names of the corridor cities, so the explanation stays one line. */
const CITY_ABBREVIATIONS: Readonly<Record<string, string>> = {
  monterrey: 'MTY',
  guadalajara: 'GDL',
  'ciudad de méxico': 'CDMX',
  'san luis potosí': 'SLP',
  querétaro: 'QRO',
  aguascalientes: 'AGS',
};

export function shortCityName(city: string): string {
  return CITY_ABBREVIATIONS[city.trim().toLowerCase()] ?? city.trim();
}

export const matchingCopy = {
  returnTrip: 'Viaje de regreso',
  estimatedDistance: 'Distancia estimada',
  emptyKm: (km: number) => (km < 1 ? 'Sin km en vacío' : `${formatDistance(km)} en vacío`),
  pricePerKm: (cents: number) => `${mxnWhole.format(cents / 100)}/km`,
  idleHours: (hours: number) =>
    hours < 1 ? 'recolección inmediata' : `${Math.round(hours)} h de espera`,
  route: (origin: string, destination: string) =>
    `coincide con tu ruta ${shortCityName(origin)}–${shortCityName(destination)}`,
  returnHome: 'te acerca a tu base',
  /** H4: estimated tolls of the suggested route ("~$748 de casetas"; "desde" when incomplete). */
  tolls: (cents: number, missing: boolean) =>
    `${missing ? 'desde ' : '~'}${mxnWhole.format(cents / 100)} de casetas`,
  highRisk: (n: number) => (n === 1 ? '1 tramo inseguro' : `${n} tramos inseguros`),
};

/** Whole pesos, e.g. "$748" (estimates on cards). */
export function formatMxnWhole(cents: number): string {
  return mxnWhole.format(cents / 100);
}

/** One-line, explainable summary of why a load is recommended. */
export function matchExplanation(breakdown: MatchBreakdown): string {
  const parts = [
    matchingCopy.emptyKm(breakdown.emptyKm),
    matchingCopy.pricePerKm(breakdown.pricePerKmCents),
    matchingCopy.idleHours(breakdown.idleHours),
  ];
  if (breakdown.matchedRoute) {
    parts.push(
      matchingCopy.route(breakdown.matchedRoute.originCity, breakdown.matchedRoute.destinationCity),
    );
  }
  if (breakdown.returnHome) parts.push(matchingCopy.returnHome);
  // Older answers of the Edge Function have no road fields.
  if (typeof breakdown.tollsCents === 'number' && breakdown.tollsCents > 0) {
    parts.push(matchingCopy.tolls(breakdown.tollsCents, breakdown.tollsMissing));
  }
  if (breakdown.highRiskSegments > 0) parts.push(matchingCopy.highRisk(breakdown.highRiskSegments));
  return parts.join(' · ');
}
