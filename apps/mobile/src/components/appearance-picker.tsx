import { appearanceCopy, THEME_CHOICES } from '@transport/shared';
import { StyleSheet, Text, View } from 'react-native';

import { spacing, useTheme } from '../theme';
import { Segmented } from './ui';

const OPTIONS = THEME_CHOICES.map((value) => ({ value, label: appearanceCopy[value] }));

/** "Apariencia" (D26): Sistema, Claro or Oscuro, kept on the phone. */
export function AppearancePicker() {
  const { choice, setChoice, type } = useTheme();
  return (
    <View style={styles.group}>
      <Text style={type.label}>{appearanceCopy.title}</Text>
      <Segmented
        label={appearanceCopy.title}
        value={choice}
        options={OPTIONS}
        onChange={setChoice}
      />
    </View>
  );
}

const styles = StyleSheet.create({ group: { gap: spacing.sm } });
