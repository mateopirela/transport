import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { lookOf, shape, spacing, useTheme, type Look } from '../theme';

/**
 * Scrollable screen that keeps inputs above the keyboard. `belowHeader` for
 * screens under a navigation header, which already covers the top inset.
 */
export function Screen({
  children,
  belowHeader = false,
}: {
  children: ReactNode;
  belowHeader?: boolean;
}) {
  const styles = useKit();
  return (
    <SafeAreaView
      style={styles.safe}
      edges={belowHeader ? ['left', 'right'] : ['top', 'left', 'right']}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Title({ children, subtitle }: { children: string; subtitle?: string }) {
  const styles = useKit();
  return (
    <View style={styles.titleBlock}>
      <Text accessibilityRole="header" style={styles.title}>
        {children}
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Field({
  label,
  error,
  ...input
}: { label: string; error?: string | undefined } & TextInputProps) {
  const styles = useKit();
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textFaint}
        style={[styles.input, error ? styles.inputError : null]}
        {...input}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'link';
  loading?: boolean;
  disabled?: boolean;
}) {
  const styles = useKit();
  const { colors } = useTheme();
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        pressed ? styles.pressed : null,
        inactive ? styles.inactive : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.accentInk : colors.accentText} />
      ) : (
        <Text style={[styles.buttonText, variant === 'primary' ? styles.onAccent : styles.onPage]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Notice({
  tone,
  title,
  children,
}: {
  tone: 'info' | 'warning' | 'danger';
  title?: string;
  children?: ReactNode;
}) {
  const styles = useKit();
  return (
    <View
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      style={[styles.notice, styles[`${tone}Notice`]]}
    >
      {title ? <Text style={[styles.noticeTitle, styles[`${tone}Title`]]}>{title}</Text> : null}
      {typeof children === 'string' ? <Text style={styles.noticeText}>{children}</Text> : children}
    </View>
  );
}

export function Centered({ children }: { children: ReactNode }) {
  const styles = useKit();
  return <View style={styles.centered}>{children}</View>;
}

export function Loading({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <Centered>
      <ActivityIndicator color={colors.accent} accessibilityLabel={label} />
    </Centered>
  );
}

export function Body({ children }: { children: ReactNode }) {
  const styles = useKit();
  return <Text style={styles.body}>{children}</Text>;
}

/** The kit's styles on the colours and type of one theme. */
function makeStyles({ colors, type }: Look) {
  return StyleSheet.create({
    flex: { flex: 1 },
    safe: { flex: 1, backgroundColor: colors.bg },
    content: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
      gap: spacing.md,
      backgroundColor: colors.bg,
    },
    titleBlock: { gap: spacing.xs, marginBottom: spacing.sm },
    title: type.title1,
    subtitle: { ...type.subhead, color: colors.textDim },
    body: type.subhead,
    field: { gap: spacing.xs },
    label: type.label,
    input: {
      ...type.callout,
      minHeight: shape.fieldHeight,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.separator,
      borderRadius: shape.field,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.cell,
    },
    inputError: { borderColor: colors.red },
    fieldError: { ...type.footnote, color: colors.redText },
    button: {
      minHeight: shape.buttonHeight,
      borderRadius: shape.pill,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
    },
    primary: { backgroundColor: colors.accent },
    secondary: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.separator,
      backgroundColor: colors.cell,
    },
    link: { backgroundColor: 'transparent' },
    pressed: { opacity: 0.8 },
    inactive: { opacity: 0.5 },
    buttonText: type.headline,
    onAccent: { color: colors.accentInk },
    onPage: { color: colors.accentText },
    notice: { borderRadius: shape.card, padding: spacing.md, gap: spacing.xs },
    infoNotice: { backgroundColor: colors.infoSurface },
    warningNotice: { backgroundColor: colors.highlight },
    dangerNotice: { backgroundColor: colors.dangerSurface },
    noticeTitle: type.headline,
    infoTitle: { color: colors.accentText },
    warningTitle: { color: colors.amberText },
    dangerTitle: { color: colors.redText },
    noticeText: type.subhead,
  });
}

const KIT = { light: makeStyles(lookOf('light')), dark: makeStyles(lookOf('dark')) };

function useKit() {
  return KIT[useTheme().theme];
}
