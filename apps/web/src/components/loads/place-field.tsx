'use client';

import { CITY_PRESETS, cityPreset, findCityPreset, loadsCopy } from '@transport/shared';
import { useEffect, useEffectEvent, useRef, useState } from 'react';

import { ErrorText } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { googleMapsKey, loadGoogleMaps } from '@/lib/google-maps';
import { PLACE_FIELDS, type PlaceKey, type PlaceValue } from '@/lib/loads/form';
import { placeFromGoogle, placeFromPreset } from '@/lib/loads/places';

const c = loadsCopy.form;

/**
 * Origin or destination. With a Maps key it is Google Places Autocomplete
 * (restricted to Mexico); without one, or if Maps fails to load, a preset
 * city plus a typed street. Either way the hidden inputs carry the address,
 * point, city and state that the load stores.
 */
export function PlaceField({
  name,
  label,
  value,
  onChange,
  error,
}: {
  name: PlaceKey;
  label: string;
  value: PlaceValue | null;
  onChange: (value: PlaceValue | null) => void;
  error?: string;
}) {
  const key = googleMapsKey();
  const [failed, setFailed] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const id = `field-${name}`;

  // A failed or incomplete pick clears the field: the previous place must not
  // be saved silently in its place.
  const onSelect = useEffectEvent((place: PlaceValue | null, problem: string | null) => {
    setIssue(problem);
    onChange(place);
  });

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    let element: google.maps.places.PlaceAutocompleteElement | null = null;
    // Only the latest pick may update the field (details load asynchronously).
    let latest = 0;
    loadGoogleMaps(key)
      .then(() => google.maps.importLibrary('places'))
      .then(({ PlaceAutocompleteElement }) => {
        if (cancelled || !container.current) return;
        element = new PlaceAutocompleteElement({ includedRegionCodes: ['mx'] });
        element.id = id;
        element.addEventListener('gmp-select', async (event) => {
          const request = ++latest;
          const current = () => !cancelled && request === latest;
          onSelect(null, null);
          try {
            const { placePrediction } = event as google.maps.places.PlacePredictionSelectEvent;
            const { place } = await placePrediction.toPlace().fetchFields({
              fields: ['id', 'formattedAddress', 'location', 'addressComponents'],
            });
            const picked = placeFromGoogle({
              id: place.id,
              formattedAddress: place.formattedAddress,
              lat: place.location?.lat(),
              lng: place.location?.lng(),
              addressComponents: place.addressComponents,
            });
            if (current()) onSelect(picked, picked ? null : c.placeIncomplete);
          } catch {
            if (current()) onSelect(null, c.placeError);
          }
        });
        // Typing again discards the picked place (and any details still loading):
        // what is saved must always match a suggestion the person chose.
        element.addEventListener('input', () => {
          latest += 1;
          onSelect(null, null);
        });
        // Places failing at runtime (quota, key restrictions): use the presets.
        element.addEventListener('gmp-error', () => {
          if (!cancelled) setFailed(true);
        });
        container.current.append(element);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      element?.remove();
    };
  }, [key, id]);

  const message = issue ?? error;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="block px-1">
        {label}
      </Label>
      {PLACE_FIELDS.map((field) => (
        <input key={field} type="hidden" name={`${name}.${field}`} value={value?.[field] ?? ''} />
      ))}
      {key && !failed ? (
        <div ref={container} aria-invalid={message ? true : undefined} />
      ) : (
        <PresetPlace id={id} value={value} onChange={onChange} invalid={Boolean(message)} />
      )}
      {value && (
        <p className="px-1 text-footnote text-text-dim">{c.placeSelected(value.address)}</p>
      )}
      {message && <ErrorText>{message}</ErrorText>}
    </div>
  );
}

/** Without Places: a city from the pilot presets plus the street. */
function PresetPlace({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string;
  value: PlaceValue | null;
  onChange: (value: PlaceValue | null) => void;
  invalid: boolean;
}) {
  const initial = value ? findCityPreset(value.city, value.state) : undefined;
  const [presetId, setPresetId] = useState(initial?.id ?? '');
  const suffix = initial ? `, ${initial.city}, ${initial.state}` : '';
  const [street, setStreet] = useState(
    value && suffix && value.address.endsWith(suffix) ? value.address.slice(0, -suffix.length) : '',
  );

  function update(nextPresetId: string, nextStreet: string) {
    setPresetId(nextPresetId);
    setStreet(nextStreet);
    const preset = cityPreset(nextPresetId);
    onChange(preset ? placeFromPreset(preset, nextStreet) : null);
  }

  return (
    <div className="grid gap-2 sm:grid-cols-[14rem_1fr]">
      <Select
        id={id}
        aria-label={c.city}
        value={presetId}
        onChange={(e) => update(e.target.value, street)}
        aria-invalid={invalid || undefined}
      >
        <option value="">{c.cityPlaceholder}</option>
        {CITY_PRESETS.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.city}, {preset.state}
          </option>
        ))}
      </Select>
      <Input
        aria-label={c.street}
        placeholder={c.street}
        value={street}
        maxLength={200}
        onChange={(e) => update(presetId, e.target.value)}
      />
      <p className="px-1 text-footnote text-text-dim sm:col-span-2">{c.presetHint}</p>
    </div>
  );
}
