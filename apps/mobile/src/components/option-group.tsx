import { StyleSheet, View } from 'react-native';

import { spacing } from '../theme';
import { Cell, ErrorText, Footnote, Group, GroupLabel } from './ui';

/**
 * A labelled choice among a few exclusive options (the registration kind),
 * as the phone's own settings: a group of rows, the chosen one with a check,
 * and the hint of the choice (or the error) under it.
 */
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
    <>
      <GroupLabel>{label}</GroupLabel>
      <View accessibilityRole="radiogroup" accessibilityLabel={label}>
        <Group>
          {options.map((option) => (
            <Cell
              key={option.value}
              role="radio"
              title={option.label}
              lines={2}
              checked={value === option.value}
              onPress={() => onChange(option.value)}
            />
          ))}
        </Group>
      </View>
      {error ? (
        <View style={styles.error}>
          <ErrorText>{error}</ErrorText>
        </View>
      ) : hint ? (
        <Footnote>{hint}</Footnote>
      ) : null}
    </>
  );
}

/** The error lines up with the Footnote it takes the place of. */
const styles = StyleSheet.create({
  error: { paddingHorizontal: spacing.md, marginTop: -spacing.xs },
});
