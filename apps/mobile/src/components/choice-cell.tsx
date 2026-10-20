import type { SelectOption } from '@transport/shared';
import { StyleSheet, View } from 'react-native';

import { spacing } from '../theme';
import { Chip, ControlCell } from './ui';

/*
 * Choices as a row of a group (docs/plan-rediseno.md §1.6, forms in groups):
 * the label above and the options as chips that wrap, the chosen ones on the
 * accent's tint. They take the place of ChoiceChips and MultiChips inside a
 * Group; U9 may fold them into the kit.
 */

/** One option among a few. With `clearable`, tapping the chosen one again clears the choice. */
export function ChoiceCell<T extends string>({
  label,
  options,
  value,
  onChange,
  clearable = false,
  error,
}: {
  label: string;
  options: readonly SelectOption<T>[];
  value: T | undefined;
  onChange: (value: T | undefined) => void;
  clearable?: boolean;
  error?: string | undefined;
}) {
  return (
    <ControlCell label={label} error={error}>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.wrap}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Chip
              key={option.value}
              role="radio"
              label={option.label}
              selected={selected}
              onPress={() => {
                if (!selected) onChange(option.value);
                else if (clearable) onChange(undefined);
              }}
            />
          );
        })}
      </View>
    </ControlCell>
  );
}

/** Several options at once: each chip toggles its own. */
export function MultiChoiceCell<T extends string>({
  label,
  options,
  values,
  onToggle,
  error,
}: {
  label: string;
  options: readonly SelectOption<T>[];
  values: readonly T[];
  onToggle: (value: T) => void;
  error?: string | undefined;
}) {
  return (
    <ControlCell label={label} error={error}>
      <View accessibilityLabel={label} style={styles.wrap}>
        {options.map((option) => (
          <Chip
            key={option.value}
            role="checkbox"
            label={option.label}
            selected={values.includes(option.value)}
            onPress={() => onToggle(option.value)}
          />
        ))}
      </View>
    </ControlCell>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingTop: spacing.xs },
});
