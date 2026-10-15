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

import { colors, fonts, spacing } from '../theme';

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
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
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
        pressed && variant === 'primary' ? styles.primaryPressed : null,
        inactive ? styles.inactive : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.onAccent : colors.accent} />
      ) : (
        <Text style={[styles.buttonText, variant === 'primary' ? styles.onAccent : styles.onLight]}>
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
  return (
    <View
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      style={[styles.notice, noticeTone[tone]]}
    >
      {title ? <Text style={[styles.noticeTitle, { color: colors[tone] }]}>{title}</Text> : null}
      {typeof children === 'string' ? <Text style={styles.noticeText}>{children}</Text> : children}
    </View>
  );
}

export function Centered({ children }: { children: ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

export function Loading({ label }: { label: string }) {
  return (
    <Centered>
      <ActivityIndicator color={colors.accent} accessibilityLabel={label} />
    </Centered>
  );
}

export function Body({ children }: { children: ReactNode }) {
  return <Text style={styles.body}>{children}</Text>;
}

const noticeTone = StyleSheet.create({
  info: { backgroundColor: colors.infoSurface, borderColor: colors.info },
  warning: { backgroundColor: colors.warningSurface, borderColor: colors.warning },
  danger: { backgroundColor: colors.dangerSurface, borderColor: colors.danger },
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  titleBlock: { gap: spacing.xs, marginBottom: spacing.sm },
  title: { fontFamily: fonts.title, fontSize: 28, color: colors.navy, fontWeight: '600' },
  subtitle: { fontSize: 15, color: colors.textMuted, lineHeight: 21 },
  body: { fontSize: 15, color: colors.text, lineHeight: 22 },
  field: { gap: spacing.xs },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    fontSize: 16,
    color: colors.text,
  },
  inputError: { borderColor: colors.danger },
  fieldError: { fontSize: 13, color: colors.danger },
  button: {
    minHeight: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  primary: { backgroundColor: colors.accent },
  primaryPressed: { backgroundColor: colors.accentPressed },
  secondary: { borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.surface },
  link: { backgroundColor: 'transparent' },
  inactive: { opacity: 0.6 },
  buttonText: { fontSize: 16, fontWeight: '600' },
  onAccent: { color: colors.onAccent },
  onLight: { color: colors.accent },
  notice: { borderLeftWidth: 4, borderRadius: 8, padding: spacing.md, gap: spacing.xs },
  noticeTitle: { fontSize: 15, fontWeight: '700' },
  noticeText: { fontSize: 14, color: colors.text, lineHeight: 20 },
});
