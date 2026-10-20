import { appearanceCopy, THEME_CHOICES } from '@transport/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { lookOf, shape, spacing, useTheme, type Look } from '../theme';

/**
 * "Apariencia" (D26): Sistema, Claro or Oscuro, kept on the phone. A segmented
 * control until U2 brings the kit's `Segmented`.
 */
export function AppearancePicker() {
  const { theme, choice, setChoice } = useTheme();
  const styles = STYLES[theme];
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{appearanceCopy.title}</Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={appearanceCopy.title}
        style={styles.track}
      >
        {THEME_CHOICES.map((option) => {
          const selected = option === choice;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => setChoice(option)}
              style={[styles.segment, selected ? styles.selected : null]}
            >
              <Text style={[styles.text, selected ? styles.selectedText : null]}>
                {appearanceCopy[option]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function makeStyles({ colors, type }: Look) {
  return StyleSheet.create({
    group: { gap: spacing.sm },
    label: type.label,
    track: {
      flexDirection: 'row',
      padding: spacing.xs / 2,
      borderRadius: shape.pill,
      backgroundColor: colors.surfaceHigh,
    },
    segment: {
      flex: 1,
      minHeight: shape.buttonHeightSmall - spacing.xs,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: shape.pill,
    },
    // The selected segment is one of the two shadows the system allows (§1.3).
    selected: {
      backgroundColor: colors.cell,
      shadowColor: colors.text,
      shadowOpacity: 0.08,
      shadowRadius: spacing.xs,
      shadowOffset: { width: 0, height: 1 },
      elevation: 1,
    },
    text: { ...type.subhead, color: colors.textDim },
    selectedText: { ...type.subhead, fontFamily: type.headline.fontFamily, color: colors.text },
  });
}

const STYLES = { light: makeStyles(lookOf('light')), dark: makeStyles(lookOf('dark')) };
