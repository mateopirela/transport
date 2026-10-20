import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { fleetCopy, mobileAuthCopy, type StatusTone, toneColors } from '@transport/shared';
import { BlurView } from 'expo-blur';
import {
  Children,
  createContext,
  Fragment,
  isValidElement,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  iconSize,
  lookOf,
  motion,
  opacity,
  shadows,
  shape,
  spacing,
  tabBar,
  useTheme,
  type Look,
} from '../theme';
import { Icon, type IconName } from './icons';

/*
 * The kit of "Transport · Nativo" (docs/plan-rediseno.md §1.6): a screen on
 * the warm page with an optional large title, groups of white cells with
 * inset hairlines, pill buttons (one primary per screen), tinted status
 * pills, chips and a segmented control, fields, and loading and empty states
 * shaped like the content they stand for. Everything reads its colours and
 * type from useTheme(), so it follows the light and the dark theme.
 */

// ---------------------------------------------------------------------------
// Screen and text
// ---------------------------------------------------------------------------

/** Where the floating tab bar sits over the bottom edge, given the phone's bottom inset. */
export function tabBarBottom(insetBottom: number): number {
  return insetBottom > 0 ? Math.max(insetBottom - spacing.sm, 0) : tabBar.inset;
}

/** True inside a tab navigator with the floating bar: its screens keep clear of it. */
const InTabsContext = createContext(false);

/** Wraps a tab navigator whose bar floats over its screens (components/tab-bar.tsx). */
export function TabScreens({ children }: { children: ReactNode }) {
  return <InTabsContext.Provider value>{children}</InTabsContext.Provider>;
}

/** How much room a screen keeps under its content for the floating tab bar (0 outside the tabs). */
export function useTabBarClearance(): number {
  const inTabs = useContext(InTabsContext);
  const insets = useSafeAreaInsets();
  return inTabs ? tabBar.height + tabBarBottom(insets.bottom) : 0;
}

/**
 * A screen that scrolls on the page colour, 16 from each side, with fields
 * kept above the keyboard. A tab screen clears the status bar and the
 * floating tab bar by itself; `belowHeader` for a screen under a navigation
 * header, which already covers the top. `title` opens it with a large title.
 * `bottom` is the height of a BottomBar over it.
 */
export function Screen({
  children,
  belowHeader = false,
  title,
  subtitle,
  right,
  bottom = 0,
  onRefresh,
  refreshing = false,
  scrollRef,
}: {
  children: ReactNode;
  belowHeader?: boolean;
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  bottom?: number;
  onRefresh?: () => void;
  refreshing?: boolean;
  scrollRef?: Ref<ScrollView>;
}) {
  const kit = useKit();
  const { colors, theme } = useTheme();
  const clearance = useTabBarClearance();
  const extra = Math.max(clearance, bottom);
  return (
    <SafeAreaView
      style={kit.page}
      edges={belowHeader ? ['left', 'right'] : ['top', 'left', 'right']}
    >
      {/* The page shrinks above the keyboard (iOS; Android resizes the window), so a field
          scrolled to the middle of the screen is never under it. */}
      <KeyboardAvoidingView
        style={kit.page}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          style={kit.page}
          contentContainerStyle={[
            kit.screen,
            belowHeader ? kit.screenBelowHeader : null,
            extra > 0 ? { paddingBottom: extra + spacing.lg } : null,
          ]}
          keyboardShouldPersistTaps="handled"
          indicatorStyle={theme === 'dark' ? 'white' : 'black'}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.textDim}
              />
            ) : undefined
          }
        >
          {title ? <LargeTitle title={title} subtitle={subtitle} right={right} /> : null}
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** The large title that opens a screen, its subtitle, and room above it on the right for an action. */
export function LargeTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string | undefined;
  right?: ReactNode;
}) {
  const kit = useKit();
  return (
    <View style={kit.largeTitle}>
      {right ? <View style={kit.largeTitleRight}>{right}</View> : null}
      <Text accessibilityRole="header" style={kit.largeTitleText}>
        {title}
      </Text>
      {subtitle ? <Text style={kit.dim}>{subtitle}</Text> : null}
    </View>
  );
}

/** The title of a section (title3), with an optional text action on its right. */
export function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: { label: string; onPress: () => void } | undefined;
}) {
  const kit = useKit();
  return (
    <View style={kit.sectionHeader}>
      <Text accessibilityRole="header" style={[kit.sectionTitle, kit.grow]}>
        {title}
      </Text>
      {action ? (
        <Text accessibilityRole="button" onPress={action.onPress} style={kit.sectionAction}>
          {action.label}
        </Text>
      ) : null}
    </View>
  );
}

/** The small label over a group of fields or choices. */
export function GroupLabel({ children }: { children: ReactNode }) {
  const kit = useKit();
  return <Text style={[kit.label, kit.groupLabel]}>{children}</Text>;
}

/** The line under a group that explains it. */
export function Footnote({ children }: { children: ReactNode }) {
  const kit = useKit();
  return <Text style={[kit.footnote, kit.groupFootnote]}>{children}</Text>;
}

// ---------------------------------------------------------------------------
// Groups and cells
// ---------------------------------------------------------------------------

/** Where the separator between rows starts: after the padding, or after a leading icon. */
export const groupInset = Object.freeze({
  text: shape.separatorInset,
  icon: shape.separatorInset + iconSize.cell + spacing.sm + spacing.xs,
});

/**
 * The rows of a group: a fragment counts as the rows inside it, each with its
 * separator. A row's key carries the keys of the fragments around it, so the
 * rows of a fragment never clash with the rows next to it (`Children.toArray`
 * numbers each level from `.0` again).
 */
function flattenRows(children: ReactNode, prefix = ''): { key: string; row: ReactNode }[] {
  return Children.toArray(children).flatMap((child, i) => {
    const key = `${prefix}${isValidElement(child) && child.key !== null ? child.key : i}`;
    return isValidElement(child) && child.type === Fragment
      ? flattenRows((child.props as { children?: ReactNode }).children, `${key}/`)
      : [{ key, row: child }];
  });
}

/**
 * A group of cells: the cell colour, radius 16, a hairline around it and an
 * inset hairline between its rows (`inset`, 16 for text rows).
 */
export function Group({
  children,
  inset = groupInset.text,
  style,
}: {
  children: ReactNode;
  inset?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const kit = useKit();
  const rows = flattenRows(children);
  return (
    <View style={[kit.group, style]}>
      {rows.map(({ key, row }, i) => (
        <View key={key}>
          {i > 0 ? <View style={[kit.separator, { marginLeft: inset }]} /> : null}
          {row}
        </View>
      ))}
    </View>
  );
}

export type CellRole = 'button' | 'link' | 'radio' | 'checkbox';

/**
 * A row of a group, 50 or more high: a leading icon, the title and up to two
 * lines under it, a value or a pill on the right. A row that opens another
 * screen has `role="link"` and shows a chevron; a choice shows a check when
 * `checked`. Destructive rows read in red.
 */
export function Cell({
  title,
  subtitle,
  value,
  icon,
  leading,
  trailing,
  pill,
  onPress,
  role = 'button',
  chevron,
  checked,
  destructive = false,
  strong = false,
  disabled = false,
  lines = 1,
  subtitleLines = 2,
  accessibilityLabel,
  children,
}: {
  title?: string;
  subtitle?: string | null | undefined;
  value?: string | null | undefined;
  icon?: IconName;
  /** Anything before the text that is not an icon of the set. */
  leading?: ReactNode;
  /** A switch, a count, a button after the text. */
  trailing?: ReactNode;
  pill?: { label: string; tone: PillTone } | undefined;
  onPress?: () => void;
  role?: CellRole;
  /** Shown by default on a pressable `link` row. */
  chevron?: boolean;
  checked?: boolean;
  destructive?: boolean;
  /** The title in the headline weight. */
  strong?: boolean;
  disabled?: boolean;
  lines?: number;
  subtitleLines?: number;
  accessibilityLabel?: string;
  /** In place of title and subtitle: anything else inside the row. */
  children?: ReactNode;
}) {
  const kit = useKit();
  const { colors } = useTheme();
  const showChevron = chevron ?? (onPress !== undefined && role === 'link');
  const body = (
    <>
      {icon ? (
        <Icon name={icon} size={iconSize.cell} color={destructive ? colors.red : colors.textDim} />
      ) : null}
      {leading}
      <View style={kit.cellText}>
        {children ?? (
          <>
            <Text
              style={[strong ? kit.headline : kit.body, destructive ? kit.redText : null]}
              numberOfLines={lines}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text style={kit.cellSubtitle} numberOfLines={subtitleLines}>
                {subtitle}
              </Text>
            ) : null}
          </>
        )}
      </View>
      {value ? (
        <Text style={kit.cellValue} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {pill ? <Pill label={pill.label} tone={pill.tone} /> : null}
      {trailing}
      {checked ? <Icon name="check" size={iconSize.cell} color={colors.accentText} /> : null}
      {showChevron ? (
        <Icon name="chevronRight" size={iconSize.small} color={colors.textFaint} />
      ) : null}
    </>
  );
  if (!onPress) return <View style={kit.cell}>{body}</View>;
  const selectable = role === 'radio' || role === 'checkbox';
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={
        selectable ? { checked: checked === true, disabled } : disabled ? { disabled } : undefined
      }
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        kit.cell,
        pressed ? kit.cellPressed : null,
        disabled ? kit.disabled : null,
      ]}
    >
      {body}
    </Pressable>
  );
}

/** A row with a switch on its right, as the phone's own settings. */
export function SwitchCell({
  title,
  subtitle,
  icon,
  value,
  onChange,
  disabled = false,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Cell
      title={title}
      subtitle={subtitle}
      icon={icon}
      lines={2}
      trailing={
        <Switch
          accessibilityLabel={title}
          value={value}
          onValueChange={onChange}
          disabled={disabled}
          trackColor={{ true: colors.accent, false: colors.separator }}
          ios_backgroundColor={colors.separator}
        />
      }
    />
  );
}

/**
 * A field as a row of a group: the label small above and the text written
 * on the cell, as the phone's own forms. `inSheet` inside a Sheet, so the
 * sheet makes room for the keyboard.
 */
export function FieldCell({
  label,
  error,
  inSheet = false,
  style,
  ...input
}: TextInputProps & { label: string; error?: string | undefined; inSheet?: boolean }) {
  const kit = useKit();
  const { colors, theme } = useTheme();
  const Input = inSheet ? BottomSheetTextInput : TextInput;
  return (
    <View style={kit.controlCell}>
      <Text style={[kit.label, error ? kit.redText : null]}>{label}</Text>
      <Input
        accessibilityLabel={label}
        placeholderTextColor={colors.textFaint}
        keyboardAppearance={theme}
        style={[kit.fieldCellInput, input.multiline ? kit.multiline : null, style]}
        {...input}
      />
      {error ? <ErrorText>{error}</ErrorText> : null}
    </View>
  );
}

/** A control (a segmented control, chips, a checkbox) as a row of a group, with its label above. */
export function ControlCell({
  label,
  error,
  children,
}: {
  label?: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  const kit = useKit();
  return (
    <View style={kit.controlCell}>
      {label ? <Text style={kit.label}>{label}</Text> : null}
      {children}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </View>
  );
}

/** A paragraph as a row of a group: an explanation, a lead. */
export function TextCell({
  children,
  icon,
  tone = 'body',
}: {
  children: ReactNode;
  icon?: IconName;
  tone?: 'body' | 'dim';
}) {
  const kit = useKit();
  const { colors } = useTheme();
  return (
    <View style={kit.textCell}>
      {icon ? <Icon name={icon} size={iconSize.cell} color={colors.textDim} /> : null}
      <Text style={[tone === 'dim' ? kit.dim : kit.body, kit.grow]}>{children}</Text>
    </View>
  );
}

/** A label and a value on one row of a group: the label dim, the figure tabular; a total in the headline weight. */
export function ValueRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  const kit = useKit();
  return (
    <View style={kit.valueRow}>
      <Text style={[strong ? kit.headline : kit.dim, kit.shrink]}>{label}</Text>
      <Text style={[strong ? kit.headline : kit.subheadText, kit.num, kit.valueText]}>{value}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Buttons and bars
// ---------------------------------------------------------------------------

export type ButtonVariant = 'primary' | 'secondary' | 'plain' | 'destructive';

/**
 * The hit slop that makes a control `height` high a 44-point touch target
 * (shape.minTouch) without drawing it bigger: the small button, chips and segments.
 */
export function touchSlop(height: number): { top: number; bottom: number } | undefined {
  const extra = Math.max(0, (shape.minTouch - height) / 2);
  return extra > 0 ? { top: extra, bottom: extra } : undefined;
}

/**
 * The buttons of the system, all pills, 52 high (40 `small`): `primary` in
 * the accent, the only one per screen; `secondary` on the cell colour;
 * `plain` as text; `destructive` in red. `loading` shows a spinner and
 * disables it.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'regular',
  loading = false,
  disabled = false,
  icon,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: 'regular' | 'small';
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  accessibilityLabel?: string;
}) {
  const kit = useKit();
  const { colors } = useTheme();
  const kind = variant;
  const off = disabled || loading;
  const ink = off
    ? colors.textFaint
    : kind === 'primary'
      ? colors.accentInk
      : kind === 'destructive'
        ? colors.redText
        : kind === 'plain'
          ? colors.accentText
          : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: off, busy: loading }}
      disabled={off}
      onPress={onPress}
      hitSlop={touchSlop(size === 'small' ? shape.buttonHeightSmall : shape.buttonHeight)}
      style={({ pressed }) => [
        kit.button,
        size === 'small' ? kit.buttonSmall : null,
        kind === 'primary'
          ? kit.buttonPrimary
          : kind === 'plain'
            ? kit.buttonPlain
            : kit.buttonSecondary,
        off && kind !== 'plain' ? kit.buttonOff : null,
        pressed && !off ? kit.pressed : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={ink} />
      ) : icon ? (
        <Icon name={icon} size={iconSize.cell} color={ink} />
      ) : null}
      <Text
        style={[kit.buttonText, size === 'small' ? kit.buttonTextSmall : null, { color: ink }]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The bar that stays at the bottom of a screen, on the theme's glass: the
 * screen's one primary action, an optional secondary one beside it, a figure
 * on the left and a note under it. The screen keeps clear of it with
 * Screen's `bottom` and the height `onHeight` reports.
 */
export function BottomBar({
  action,
  secondary,
  figure,
  note,
  onHeight,
}: {
  action: {
    label: string;
    onPress: () => void;
    loading?: boolean;
    disabled?: boolean;
    variant?: 'primary' | 'destructive';
  };
  secondary?: { label: string; onPress: () => void; disabled?: boolean } | undefined;
  figure?: { label: string; value: string } | undefined;
  note?: string | undefined;
  onHeight?: (height: number) => void;
}) {
  const kit = useKit();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <BlurView
      intensity={40}
      tint={theme}
      style={[kit.bar, { paddingBottom: insets.bottom + spacing.sm }]}
      onLayout={(event) => onHeight?.(event.nativeEvent.layout.height)}
    >
      <View style={kit.barRow}>
        {figure ? (
          <View style={kit.grow}>
            <Text style={kit.footnote} numberOfLines={1}>
              {figure.label}
            </Text>
            <Text style={[kit.title3, kit.num]} numberOfLines={1}>
              {figure.value}
            </Text>
          </View>
        ) : null}
        {secondary ? (
          <View style={kit.grow}>
            <Button
              label={secondary.label}
              onPress={secondary.onPress}
              disabled={secondary.disabled}
              variant="secondary"
            />
          </View>
        ) : null}
        <View style={kit.grow}>
          <Button
            label={action.label}
            onPress={action.onPress}
            loading={action.loading}
            disabled={action.disabled}
            variant={action.variant ?? 'primary'}
          />
        </View>
      </View>
      {note ? <Text style={[kit.caption, kit.center]}>{note}</Text> : null}
    </BlurView>
  );
}

// ---------------------------------------------------------------------------
// Fields and choices
// ---------------------------------------------------------------------------

/** A field: the label above, a 48-high box on the cell colour, the error in red under it (or a hint). */
export function Field({
  label,
  error,
  hint,
  style,
  ...input
}: TextInputProps & { label: string; error?: string | undefined; hint?: string | undefined }) {
  const kit = useKit();
  const { colors, theme } = useTheme();
  return (
    <View style={kit.field}>
      <Text style={kit.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textFaint}
        keyboardAppearance={theme}
        style={[
          kit.input,
          input.multiline ? kit.inputMultiline : null,
          error ? kit.inputError : null,
          style,
        ]}
        {...input}
      />
      {error ? (
        <ErrorText>{error}</ErrorText>
      ) : hint ? (
        <Text style={kit.footnote}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** A box to tick, with its text (which may hold links) beside it. */
export function Checkbox({
  checked,
  onChange,
  children,
  invalid = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  children: ReactNode;
  invalid?: boolean;
}) {
  const kit = useKit();
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={kit.checkRow}
    >
      <View
        style={[kit.checkBox, checked ? kit.checkBoxOn : null, invalid ? kit.inputError : null]}
      >
        {checked ? <Icon name="check" size={iconSize.small} color={colors.accentInk} /> : null}
      </View>
      <View style={kit.grow}>
        {typeof children === 'string' ? <Text style={kit.subheadText}>{children}</Text> : children}
      </View>
    </Pressable>
  );
}

/** The height of a segment inside its track. */
const SEGMENT_HEIGHT = shape.buttonHeightSmall - spacing.xs;

/**
 * A hit slop only works inside the bounds of every parent (Android clips it),
 * so the parents of the small controls leave room for it: padding that the
 * same negative margin takes back, so nothing moves on screen.
 */
const SEGMENT_SLOP = touchSlop(SEGMENT_HEIGHT)?.top ?? 0;
const CHIP_SLOP = touchSlop(shape.buttonHeightSmall)?.top ?? 0;

/** Two or three exclusive options side by side: the selected one lifted on the cell colour. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | undefined;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const kit = useKit();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={kit.segmentedFrame}>
      {/* The track, drawn behind the segments: the frame around it holds their touch areas. */}
      <View style={kit.segmented} />
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => {
              if (!selected) onChange(option.value);
            }}
            hitSlop={touchSlop(SEGMENT_HEIGHT)}
            style={[kit.segment, selected ? kit.segmentOn : null]}
          >
            <Text style={[kit.segmentText, selected ? kit.segmentTextOn : null]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A chip: on the cell colour with a hairline; selected, on the accent's tint. Without `onPress`, a plain tag. */
export function Chip({
  label,
  selected = false,
  onPress,
  role = 'button',
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  role?: 'button' | 'radio' | 'checkbox';
}) {
  const kit = useKit();
  const text = (
    <Text style={[kit.chipText, selected ? kit.chipTextOn : null]} numberOfLines={1}>
      {label}
    </Text>
  );
  if (!onPress) return <View style={[kit.chip, selected ? kit.chipOn : null]}>{text}</View>;
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={role === 'button' ? { selected } : { checked: selected }}
      onPress={onPress}
      hitSlop={touchSlop(shape.buttonHeightSmall)}
      style={({ pressed }) => [
        kit.chip,
        selected ? kit.chipOn : null,
        pressed ? kit.pressed : null,
      ]}
    >
      {text}
    </Pressable>
  );
}

/** Four or more exclusive options: a row of chips that scrolls sideways, each with an optional count. */
export function ChipTabs<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; count?: number }[];
  onChange: (value: T) => void;
}) {
  const kit = useKit();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={kit.chipTabs}
      contentContainerStyle={kit.chipTabsRow}
    >
      {options.map((option) => (
        <Chip
          key={option.value}
          role="radio"
          label={option.count === undefined ? option.label : `${option.label} ${option.count}`}
          selected={option.value === value}
          onPress={() => {
            if (option.value !== value) onChange(option.value);
          }}
        />
      ))}
    </ScrollView>
  );
}

/** The search field over a list: a box on the cell colour with the magnifier. */
export function SearchBox({
  label,
  placeholder,
  value,
  onChangeText,
  onSubmit,
  inSheet = false,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  onSubmit?: () => void;
  inSheet?: boolean;
}) {
  const kit = useKit();
  const { colors, theme } = useTheme();
  const Input = inSheet ? BottomSheetTextInput : TextInput;
  return (
    <View accessibilityRole="search" style={kit.searchBox}>
      <Icon name="search" size={iconSize.cell} color={colors.textFaint} />
      <Input
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? label}
        placeholderTextColor={colors.textFaint}
        keyboardAppearance={theme}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        autoCorrect={false}
        clearButtonMode="while-editing"
        style={kit.searchInput}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Status, states and notices
// ---------------------------------------------------------------------------

/** The tones of a pill: the four status tones of the palette, and a quiet one. */
export type PillTone = StatusTone | 'neutral';

/** The ground and the text of a pill of `tone` in a theme. */
export function pillColors(look: Look, tone: PillTone): { bg: string; fg: string } {
  return tone === 'neutral'
    ? { bg: look.colors.surfaceHigh, fg: look.colors.textDim }
    : toneColors(look.theme, tone);
}

/** A short state on its tone's 14 % tint: "Disponible", "En revisión", "Vencido". */
export function Pill({ label, tone = 'neutral' }: { label: string; tone?: PillTone }) {
  const kit = useKit();
  const { bg, fg } = pillColors(useTheme(), tone);
  return (
    <View style={[kit.pill, { backgroundColor: bg }]}>
      <Text style={[kit.pillText, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** An empty list, inside a group: what there is not, one sentence of what happens next, an optional way forward. */
export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body?: string | undefined;
  action?: ReactNode;
}) {
  const kit = useKit();
  return (
    <Group>
      <View style={kit.empty}>
        <Text style={kit.headline}>{title}</Text>
        {body ? <Text style={kit.dim}>{body}</Text> : null}
        {action ? <View style={kit.emptyAction}>{action}</View> : null}
      </View>
    </Group>
  );
}

/** The shape of the content while it loads: a group of rows with blank lines, breathing slowly. */
export function Skeleton({
  rows = 3,
  label = mobileAuthCopy.loading,
}: {
  rows?: number;
  label?: string;
}) {
  const kit = useKit();
  const [pulse] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.45, duration: motion.pulse, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: motion.pulse, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View
      accessible
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      style={{ opacity: pulse }}
    >
      <Group>
        {Array.from({ length: rows }, (_, i) => (
          <View key={i} style={kit.skeletonRow}>
            <View style={[kit.bone, { width: `${55 + ((i * 17) % 30)}%` }]} />
            <View style={[kit.bone, kit.boneShort]} />
          </View>
        ))}
      </Group>
    </Animated.View>
  );
}

/** What a screen shows while it reads: the skeleton of a list. */
export function Loading({ label = mobileAuthCopy.loading }: { label?: string }) {
  return <Skeleton rows={4} label={label} />;
}

/** What a screen shows when its data could not be read, with a retry. */
export function LoadError({
  onRetry,
  message = fleetCopy.loadFailed,
}: {
  onRetry: () => void;
  message?: string;
}) {
  const kit = useKit();
  return (
    <Group>
      <View accessibilityRole="alert" style={kit.empty}>
        <Text style={kit.body}>{message}</Text>
        <View style={kit.emptyAction}>
          <Button label={mobileAuthCopy.retry} variant="secondary" size="small" onPress={onRetry} />
        </View>
      </View>
    </Group>
  );
}

export type NoticeTone = 'highlight' | 'info' | 'warning' | 'danger';

/**
 * A notice: `highlight` after something went well, `info` on the accent's
 * tint, `warning` on the highlight with an amber title, `danger` on the red
 * tint (read out as an alert).
 */
export function Notice({
  tone = 'highlight',
  title,
  children,
}: {
  tone?: NoticeTone;
  title?: string | undefined;
  children?: ReactNode;
}) {
  const kit = useKit();
  return (
    <View
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      style={[kit.notice, kit[`${tone}Notice`]]}
    >
      {title ? <Text style={[kit.headline, kit[`${tone}Title`]]}>{title}</Text> : null}
      {typeof children === 'string' ? <Text style={kit.subheadText}>{children}</Text> : children}
    </View>
  );
}

/** An error next to what caused it, in red. */
export function ErrorText({ children }: { children: ReactNode }) {
  const kit = useKit();
  return (
    <Text accessibilityRole="alert" style={[kit.footnote, kit.redText]}>
      {children}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

/** The kit's styles on the colours and type of one theme. */
function makeStyles({ colors, type, theme }: Look) {
  // What is lifted (a selected segment) is lighter than its track in both themes.
  const [track, lifted] =
    theme === 'dark' ? [colors.cell, colors.surfaceHigh] : [colors.surfaceHigh, colors.cell];
  const hairline = { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.separator };
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.bg },
    screen: {
      flexGrow: 1,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.xl,
      gap: spacing.md,
    },
    screenBelowHeader: { paddingTop: spacing.sm },
    grow: { flex: 1 },
    shrink: { flexShrink: 1 },
    center: { textAlign: 'center' },
    num: type.num,
    largeTitleText: type.largeTitle,
    title3: type.title3,
    headline: type.headline,
    body: type.body,
    subheadText: type.subhead,
    dim: { ...type.subhead, color: colors.textDim },
    footnote: type.footnote,
    caption: type.caption,
    label: type.label,
    redText: { color: colors.redText },
    disabled: { opacity: opacity.disabled },
    pressed: { opacity: opacity.pressed },

    largeTitle: { gap: spacing.xs, marginBottom: spacing.sm },
    largeTitleRight: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: spacing.sm,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    sectionTitle: type.title3,
    sectionAction: { ...type.subhead, color: colors.accentText },
    groupLabel: { paddingHorizontal: spacing.md, marginBottom: -spacing.xs },
    groupFootnote: { paddingHorizontal: spacing.md, marginTop: -spacing.xs },

    group: {
      ...hairline,
      borderRadius: shape.card,
      backgroundColor: colors.cell,
      overflow: 'hidden',
    },
    separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
    cell: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + spacing.xs,
      minHeight: shape.cellMinHeight,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + spacing.xs,
    },
    cellPressed: { backgroundColor: colors.surfaceHigh },
    cellText: { flex: 1, gap: 1 },
    cellSubtitle: { ...type.subhead, color: colors.textDim },
    cellValue: { ...type.body, ...type.num, color: colors.textDim, flexShrink: 1 },
    controlCell: {
      gap: spacing.xs,
      minHeight: shape.cellMinHeight,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + spacing.xs / 2,
    },
    fieldCellInput: { ...type.body, paddingVertical: spacing.xs / 2 },
    multiline: { minHeight: shape.fieldHeight + spacing.lg, textAlignVertical: 'top' },
    textCell: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm + spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + spacing.xs,
    },
    valueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      minHeight: shape.cellMinHeight - spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    valueText: { textAlign: 'right' },

    button: {
      minHeight: shape.buttonHeight,
      borderRadius: shape.pill,
      paddingHorizontal: spacing.lg,
      flexDirection: 'row',
      gap: spacing.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonSmall: { minHeight: shape.buttonHeightSmall, paddingHorizontal: spacing.md },
    buttonPrimary: { backgroundColor: colors.accent },
    buttonSecondary: { ...hairline, backgroundColor: colors.cell },
    buttonPlain: { backgroundColor: 'transparent', paddingHorizontal: spacing.sm },
    buttonOff: { backgroundColor: colors.surfaceHigh, borderColor: colors.surfaceHigh },
    buttonText: { ...type.headline, textAlign: 'center', flexShrink: 1 },
    buttonTextSmall: type.subhead,
    bar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm + spacing.xs,
      backgroundColor: colors.glass,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.glassLine,
      overflow: 'hidden',
    },
    barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + spacing.xs },

    field: { gap: spacing.xs + spacing.xs / 2 },
    input: {
      ...type.body,
      ...hairline,
      minHeight: shape.fieldHeight,
      borderRadius: shape.field,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.cell,
    },
    inputMultiline: {
      minHeight: shape.fieldHeight * 2,
      paddingTop: spacing.sm + spacing.xs,
      textAlignVertical: 'top',
    },
    inputError: { borderWidth: 1, borderColor: colors.red },
    checkRow: {
      flexDirection: 'row',
      gap: spacing.sm + spacing.xs,
      alignItems: 'flex-start',
      minHeight: shape.buttonHeightSmall,
      paddingVertical: spacing.xs,
    },
    checkBox: {
      width: iconSize.cell + 2,
      height: iconSize.cell + 2,
      borderWidth: 1.5,
      borderColor: colors.textFaint,
      borderRadius: shape.tag,
      backgroundColor: colors.cell,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkBoxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    // The segments sit SEGMENT_SLOP from the frame's edges (the track's padding
    // above and below, plus room for their hit slop) and the track's padding
    // from its sides; the negative margin keeps the control as tall as before.
    segmentedFrame: {
      flexDirection: 'row',
      paddingHorizontal: spacing.xs / 2,
      paddingVertical: SEGMENT_SLOP,
      marginVertical: spacing.xs / 2 - SEGMENT_SLOP,
    },
    segmented: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: SEGMENT_SLOP - spacing.xs / 2,
      bottom: SEGMENT_SLOP - spacing.xs / 2,
      borderRadius: shape.pill,
      backgroundColor: track,
    },
    segment: {
      flex: 1,
      minHeight: SEGMENT_HEIGHT,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: shape.pill,
      paddingHorizontal: spacing.sm,
    },
    // The selected segment carries one of the two shadows of the system (§1.3).
    segmentOn: { backgroundColor: lifted, ...shadows.segment },
    segmentText: { ...type.subhead, color: colors.textDim },
    segmentTextOn: { ...type.subhead, fontFamily: type.headline.fontFamily, color: colors.text },
    chip: {
      ...hairline,
      minHeight: shape.buttonHeightSmall,
      justifyContent: 'center',
      borderRadius: shape.pill,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.cell,
    },
    chipOn: { borderColor: colors.accentSoft, backgroundColor: colors.accentSoft },
    chipText: { ...type.subhead, color: colors.text },
    chipTextOn: { fontFamily: type.headline.fontFamily, color: colors.accentText },
    // Room above and below the chips for their hit slop (a ScrollView clips).
    chipTabs: { marginHorizontal: -spacing.md, marginVertical: -CHIP_SLOP, flexGrow: 0 },
    chipTabsRow: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: CHIP_SLOP },
    searchBox: {
      ...hairline,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: shape.fieldHeight - spacing.xs,
      borderRadius: shape.field,
      paddingHorizontal: spacing.sm + spacing.xs,
      backgroundColor: colors.cell,
    },
    searchInput: { ...type.body, flex: 1, paddingVertical: spacing.sm },

    pill: {
      alignSelf: 'flex-start',
      minHeight: spacing.lg,
      borderRadius: shape.pill,
      paddingHorizontal: spacing.sm + spacing.xs / 2,
      justifyContent: 'center',
    },
    pillText: type.label,
    empty: { paddingHorizontal: spacing.md, paddingVertical: spacing.md + spacing.xs, gap: 2 },
    emptyAction: { marginTop: spacing.sm + spacing.xs, alignItems: 'flex-start' },
    skeletonRow: {
      minHeight: shape.cellMinHeight,
      justifyContent: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + spacing.xs,
    },
    bone: {
      height: spacing.sm + spacing.xs,
      borderRadius: shape.tag,
      backgroundColor: colors.surfaceHigh,
    },
    boneShort: { width: '35%', height: spacing.sm + 2 },
    notice: { borderRadius: shape.card, padding: spacing.md, gap: spacing.xs },
    highlightNotice: { backgroundColor: colors.highlight },
    infoNotice: { backgroundColor: colors.accentSoft },
    warningNotice: { backgroundColor: colors.highlight },
    dangerNotice: { backgroundColor: colors.redSoft },
    highlightTitle: { color: colors.text },
    infoTitle: { color: colors.accentText },
    warningTitle: { color: colors.amberText },
    dangerTitle: { color: colors.redText },
  });
}

const KIT = { light: makeStyles(lookOf('light')), dark: makeStyles(lookOf('dark')) };

function useKit() {
  return KIT[useTheme().theme];
}
