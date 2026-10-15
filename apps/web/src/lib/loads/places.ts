// Turning a picked place (Google Places or a preset city) into the place the
// load stores: address, point, city and state (plan B13 acceptance).
import type { CityPreset } from '@transport/shared';

import type { PlaceValue } from './form';

interface Component {
  longText: string | null;
  types: readonly string[];
}

/** What the form reads from a `google.maps.places.Place` after fetchFields. */
export interface GooglePlaceFields {
  id?: string | null;
  formattedAddress?: string | null;
  lat?: number | null;
  lng?: number | null;
  addressComponents?: readonly Component[] | null;
}

// City: the locality, or the municipality where there is none (e.g. some
// industrial parks); Mexico City reports only the state level.
const CITY_TYPES = ['locality', 'postal_town', 'administrative_area_level_2'] as const;

/** A Google place → form place, or null when it lacks a point, city or state. */
export function placeFromGoogle(place: GooglePlaceFields): PlaceValue | null {
  const components = place.addressComponents ?? [];
  const find = (type: string) =>
    components.find((c) => c.types.includes(type) && c.longText)?.longText ?? null;
  const state = find('administrative_area_level_1');
  const city = CITY_TYPES.map(find).find(Boolean) ?? (state === 'Ciudad de México' ? state : null);
  const address = place.formattedAddress?.trim();
  const { lat, lng } = place;
  if (!address || !city || !state || typeof lat !== 'number' || typeof lng !== 'number') {
    return null;
  }
  return {
    address,
    city,
    state,
    lat: String(lat),
    lng: String(lng),
    placeId: place.id ?? '',
  };
}

/** Fallback without a Maps key: a preset city plus the street the person typed. */
export function placeFromPreset(preset: CityPreset, street: string): PlaceValue {
  const text = street.trim();
  return {
    address: text ? `${text}, ${preset.city}, ${preset.state}` : `${preset.city}, ${preset.state}`,
    city: preset.city,
    state: preset.state,
    lat: String(preset.lat),
    lng: String(preset.lng),
    placeId: '',
  };
}
