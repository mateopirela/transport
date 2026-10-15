import Ionicons from '@expo/vector-icons/Ionicons';
import { fleetCopy, mobileAuthCopy, type SelectOption } from '@transport/shared';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { LoaderState } from '../lib/use-loader';
import { colors, spacing } from '../theme';
import { Button, Notice } from './ui';

/** Renders loaded data, a spinner while loading, or an error with a retry. */
export function Loaded<T>({
  state,
  onRetry,
  children,
}: {
  state: LoaderState<T>;
  onRetry: () => void;
  children: (data: T) => ReactNode;
}) {
  if (state.status === 'loading') {
    return <ActivityIndicator color={colors.accent} accessibilityLabel={mobileAuthCopy.loading} />;
  }
  if (state.status === 'error') {
    return (
      <Notice tone="danger" title={fleetCopy.loadFailed}>
        <Button label={mobileAuthCopy.retry} variant="secondary" onPress={onRetry} />
      </Notice>
    );
  }
  return <>{children(state.data)}</>;
}

export type Tone = 'neutral' | 'success' | 'info' | 'warning' | 'danger';

const TONES: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: colors.textMuted, bg: colors.background },
  success: { fg: colors.success, bg: colors.successSurface },
  info: { fg: colors.info, bg: colors.infoSurface },
  warning: { fg: colors.warning, bg: colors.warningSurface },
  danger: { fg: colors.danger, bg: colors.dangerSurface },
};

export function Badge({ label, tone }: { label: string; tone: Tone }) {
  const { fg, bg } = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return (
    <Text accessibilityRole="header" style={styles.section}>
      {children}
    </Text>
  );
}

/** A card; pressable (with a chevron) when `onPress` is given. */
export function Card({
  title,
  subtitle,
  onPress,
  children,
}: {
  title: string;
  subtitle?: string | null | undefined;
  onPress?: () => void;
  children?: ReactNode;
}) {
  const body = (
    <>
      <View style={styles.cardHeader}>
        <View style={styles.flex}>
          <Text style={styles.cardTitle}>{title}</Text>
          {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
        </View>
        {onPress ? <Ionicons name="chevron-forward" size={20} color={colors.textMuted} /> : null}
      </View>
      {children}
    </>
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
    >
      {body}
    </Pressable>
  ) : (
    <View style={styles.card}>{body}</View>
  );
}

/** Single choice among options, as chips. */
export function ChoiceChips<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
}: {
  label: string;
  options: readonly SelectOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  error?: string | undefined;
}) {
  return (
    <ChipGroup label={label} error={error}>
      {options.map((o) => (
        <Chip
          key={o.value}
          label={o.label}
          selected={o.value === value}
          onPress={() => onChange(o.value)}
        />
      ))}
    </ChipGroup>
  );
}

/** Several choices among options, as chips. */
export function MultiChips<T extends string>({
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
    <ChipGroup label={label} error={error}>
      {options.map((o) => (
        <Chip
          key={o.value}
          label={o.label}
          selected={values.includes(o.value)}
          onPress={() => onToggle(o.value)}
        />
      ))}
    </ChipGroup>
  );
}

function ChipGroup({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>{children}</View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected ? styles.chipSelected : null]}
    >
      <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 13, fontWeight: '600' },
  section: { fontSize: 18, fontWeight: '700', color: colors.navy, marginTop: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  pressed: { opacity: 0.8 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  cardSubtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  group: { gap: spacing.xs },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
  },
  chipSelected: { borderColor: colors.accent, backgroundColor: colors.infoSurface },
  chipText: { fontSize: 14, color: colors.text },
  chipTextSelected: { color: colors.accent, fontWeight: '600' },
  error: { fontSize: 13, color: colors.danger },
});
