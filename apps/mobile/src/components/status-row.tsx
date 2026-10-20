import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { spacing, useTheme } from '../theme';
import { Cell, Pill, type PillTone } from './ui';

/**
 * A row of a list whose state does not fit beside its title (a plate and
 * "No disponible: documentos vencidos", an operator and the date their
 * invitation lasts): the title, its lines in `footnote`, anything else
 * (`children`) and the state's pill under them. With `onPress` it opens the
 * item, with a chevron. U9 may fold it into the kit's Cell.
 */
export function StatusRow({
  title,
  lines = [],
  pill,
  onPress,
  strong = false,
  children,
}: {
  title: string;
  lines?: readonly (string | null | undefined | false)[];
  pill?: { label: string; tone: PillTone } | undefined;
  onPress?: (() => void) | undefined;
  /** The title in the headline weight, for the item's name (a plate, a route). */
  strong?: boolean;
  children?: ReactNode;
}) {
  const { type } = useTheme();
  return (
    <Cell role="link" onPress={onPress}>
      <Text style={strong ? type.headline : type.body}>{title}</Text>
      {lines.map((line, i) =>
        line ? (
          <Text key={i} style={type.footnote}>
            {line}
          </Text>
        ) : null,
      )}
      {children}
      {pill ? (
        <View style={styles.pill}>
          <Pill label={pill.label} tone={pill.tone} />
        </View>
      ) : null}
    </Cell>
  );
}

const styles = StyleSheet.create({ pill: { marginTop: spacing.xs } });
