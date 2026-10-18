import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../theme';
import { Button } from './ui';

/** A labelled row of exclusive options rendered as buttons (person type, registration kind). */
export function OptionGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  hint,
  error,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  hint?: string | undefined;
  error?: string | undefined;
}) {
  return (
    <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        {options.map((option) => (
          <View key={option.value} style={styles.flex}>
            <Button
              label={option.label}
              variant={value === option.value ? 'primary' : 'secondary'}
              onPress={() => onChange(option.value)}
            />
          </View>
        ))}
      </View>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  group: { gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  hint: { fontSize: 13, color: colors.textMuted },
  error: { fontSize: 13, color: colors.danger },
});
