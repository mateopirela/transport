import { trackingCopy as copy } from '@transport/shared';
import { Linking } from 'react-native';

import { useLocationAdvice } from '../lib/location-advice';
import { Body, Button, Notice } from './ui';

/**
 * "Ubicación precisa y Siempre" (D17): on the operator's trip, the location
 * consent and the hombre-camión's "Mi viaje", for as long as the location is
 * not precise and "Always". `hidden` lets a screen leave it out while another
 * notice already asks for the same permission.
 */
export function PreciseLocationBanner({ hidden = false }: { hidden?: boolean }) {
  const advice = useLocationAdvice();
  if (hidden || advice === null || advice === 'ok') return null;
  return (
    <Notice tone="warning" title={copy.preciseTitle}>
      <Body>{copy.preciseBody}</Body>
      <Body>{copy.preciseMissing[advice]}</Body>
      <Button
        label={copy.preciseAction}
        variant="secondary"
        onPress={() => void Linking.openSettings()}
      />
    </Notice>
  );
}
