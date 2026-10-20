import { trackingCopy as copy } from '@transport/shared';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { useLocationAdvice } from '../lib/location-advice';
import { spacing, useTheme } from '../theme';
import { Button, Notice } from './ui';

/**
 * "Ubicación precisa y Siempre" (D17): on the operator's trip, the location
 * consent and the hombre-camión's "Mi viaje", for as long as the location is
 * not precise and "Always". `hidden` lets a screen leave it out while another
 * notice already asks for the same permission.
 */
export function PreciseLocationBanner({ hidden = false }: { hidden?: boolean }) {
  const advice = useLocationAdvice();
  const { type } = useTheme();
  if (hidden || advice === null || advice === 'ok') return null;
  return (
    <Notice tone="warning" title={copy.preciseTitle}>
      <Text style={type.subhead}>{copy.preciseBody}</Text>
      <Text style={type.subhead}>{copy.preciseMissing[advice]}</Text>
      <View style={styles.action}>
        <Button
          label={copy.preciseAction}
          variant="secondary"
          size="small"
          onPress={() => void Linking.openSettings()}
        />
      </View>
    </Notice>
  );
}

const styles = StyleSheet.create({
  action: { marginTop: spacing.xs, alignItems: 'flex-start' },
});
