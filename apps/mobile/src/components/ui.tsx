import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import {
  fleetCopy,
  formatMoney,
  mobileAuthCopy,
  mobileKitCopy,
  PLATFORM_NAME,
  stateToneColors,
  type StateTone,
} from '@transport/shared';
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
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { chunkRows, stepNumber, stepStates } from '../lib/kit';
import {
  BrandSurface,
  font,
  iconSize,
  lookOf,
  motion,
  opacity,
  shape,
  spacing,
  tabBar,
  useTheme,
  type Look,
} from '../theme';
import { Icon, type IconName } from './icons';

/*
 * The kit of "Fulmis" (docs/plan-fulmis.md §1): a screen on the page with
 * an optional large title, square groups of cells with fine lines, buttons
 * with a radius of 8 (one filled primary per screen, 56 high where it is the
 * step to take), boxed fields, status pills in the six tones, notices by
 * tone, chips and a segmented control, the brand block, steps, figures and
 * indicators, and loading and empty states shaped like the content they stand
 * for. Everything reads its colours and type from useTheme(), so it follows
 * the light and the dark theme. No shadow anywhere.
 */

// ---------------------------------------------------------------------------
// Screen and text
// ---------------------------------------------------------------------------

/**
 * The room the tab bar leaves under its tabs, given the phone's bottom inset:
 * the home indicator's, a little less than the whole inset so the bar stays
 * low, and never less than the bar's own padding.
 */
export function tabBarBottom(insetBottom: number): number {
  return Math.max(insetBottom - spacing.sm, tabBar.padding);
}

/** True inside a tab navigator: its screens keep clear of the bar laid over them. */
const InTabsContext = createContext(false);

/** Wraps a tab navigator whose bar lies over its screens (components/tab-bar.tsx). */
export function TabScreens({ children }: { children: ReactNode }) {
  return <InTabsContext.Provider value>{children}</InTabsContext.Provider>;
}

/** How much room a screen keeps under its content for the tab bar (0 outside the tabs). */
export function useTabBarClearance(): number {
  const inTabs = useContext(InTabsContext);
  const insets = useSafeAreaInsets();
  return inTabs ? tabBar.height + tabBarBottom(insets.bottom) : 0;
}

/**
 * A screen that scrolls on the page colour, 16 from each side, with fields
 * kept above the keyboard. A tab screen clears the status bar and the tab
 * bar by itself; `belowHeader` for a screen under a navigation header, which
 * already covers the top. `title` opens it with a large title, under a short
 * `eyebrow` if it has one. `bottom` is the height of a BottomBar over it.
 */
export function Screen({
  children,
  belowHeader = false,
  title,
  eyebrow,
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
  eyebrow?: string;
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
          {title ? (
            <LargeTitle title={title} eyebrow={eyebrow} subtitle={subtitle} right={right} />
          ) : null}
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * The large title that opens a screen: a short label over it (`eyebrow`),
 * its subtitle, and room above it on the right for an action.
 */
export function LargeTitle({
  title,
  eyebrow,
  subtitle,
  right,
}: {
  title: string;
  eyebrow?: string | undefined;
  subtitle?: string | undefined;
  right?: ReactNode;
}) {
  const kit = useKit();
  return (
    <View style={kit.largeTitle}>
      {right ? <View style={kit.largeTitleRight}>{right}</View> : null}
      {eyebrow ? <Caps style={kit.label}>{eyebrow}</Caps> : null}
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

/**
 * A label drawn in capitals. iOS reads a transformed text the way it is drawn,
 * so the label keeps its own wording as its accessible name: a screen reader
 * and the E2E flows get "Publicada por Transport", not "PUBLICADA POR TRANSPORT".
 */
export function Caps({
  children,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  style: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  return (
    <Text
      {...(typeof children === 'string' ? { accessibilityLabel: children } : null)}
      style={style}
      numberOfLines={numberOfLines}
    >
      {children}
    </Text>
  );
}

/** The small label over a group of fields or choices. */
export function GroupLabel({ children }: { children: ReactNode }) {
  const kit = useKit();
  return <Caps style={[kit.label, kit.groupLabel]}>{children}</Caps>;
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

/** A row that is a field or a control: its own box sets it apart, so no line between two of them. */
function isFormRow(row: ReactNode): boolean {
  return isValidElement(row) && (row.type === FieldCell || row.type === ControlCell);
}

/**
 * A group of cells: the cell colour with square corners, a fine line around
 * it and an inset one between its rows (`inset`, 16 for text rows). Fields
 * and controls that follow one another go without the line: each has its box.
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
          {i > 0 && !(isFormRow(row) && isFormRow(rows[i - 1]?.row)) ? (
            <View style={[kit.separator, { marginLeft: inset }]} />
          ) : null}
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
        <Icon
          name={icon}
          size={iconSize.cell}
          color={destructive ? colors.redText : colors.textDim}
        />
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
        <Icon name="chevronRight" size={iconSize.small} color={colors.textDim} />
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
 * A field as a row of a group: the label small above its box, 48 high with
 * the control line (red on an error). `inSheet` inside a Sheet, so the sheet
 * makes room for the keyboard. A `revealable` password field (D42) has a
 * toggle at the end of its box that shows or hides what is typed: its own
 * name says what a tap does and its state says whether it is shown (the web's
 * `aria-pressed`), so the field keeps its label. `inputRef` reaches the
 * input, e.g. to scroll a form to the field with an error.
 */
export function FieldCell({
  label,
  error,
  inSheet = false,
  revealable = false,
  inputRef,
  style,
  ...input
}: TextInputProps & {
  label: string;
  error?: string | undefined;
  inSheet?: boolean;
  revealable?: boolean;
  inputRef?: Ref<TextInput>;
}) {
  const kit = useKit();
  const { colors, theme } = useTheme();
  const [shown, setShown] = useState(false);
  const Input = inSheet ? BottomSheetTextInput : TextInput;
  const reveal = revealable && input.secureTextEntry === true;
  const box = (
    <Input
      ref={inputRef as Ref<never>}
      accessibilityLabel={label}
      placeholderTextColor={colors.textDim}
      keyboardAppearance={theme}
      style={[
        kit.input,
        input.multiline ? kit.inputMultiline : null,
        error ? kit.inputError : null,
        reveal ? kit.inputRevealable : null,
        style,
      ]}
      {...input}
      secureTextEntry={reveal ? !shown : input.secureTextEntry}
    />
  );
  return (
    <View style={kit.controlCell}>
      <Caps style={[kit.fieldLabel, error ? kit.redText : null]}>{label}</Caps>
      {reveal ? (
        <View>
          {box}
          <Pressable
            accessibilityRole="togglebutton"
            accessibilityLabel={shown ? mobileKitCopy.hidePassword : mobileKitCopy.showPassword}
            accessibilityState={{ checked: shown }}
            onPress={() => setShown((current) => !current)}
            style={({ pressed }) => [kit.reveal, pressed ? kit.pressed : null]}
          >
            <Icon name={shown ? 'eyeOff' : 'eye'} size={iconSize.cell} color={colors.textDim} />
          </Pressable>
        </View>
      ) : (
        box
      )}
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
      {label ? <Caps style={kit.fieldLabel}>{label}</Caps> : null}
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

export type ButtonSize = 'small' | 'regular' | 'large';

const BUTTON_HEIGHT: Readonly<Record<ButtonSize, number>> = {
  small: shape.buttonHeightSmall,
  regular: shape.buttonHeight,
  large: shape.buttonHeightPrimary,
};

/**
 * The buttons of the system, radius 8, 48 high (40 `small`; 56 `large`, for
 * the step to take): `primary` filled with the accent, the only one per
 * screen; `secondary` with the control line; `plain` as text; `destructive`
 * with a red line. `loading` shows a spinner and disables it.
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
  size?: ButtonSize;
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
    ? colors.textDim
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
      hitSlop={touchSlop(BUTTON_HEIGHT[size])}
      style={({ pressed }) => [
        kit.button,
        size === 'small' ? kit.buttonSmall : size === 'large' ? kit.buttonLarge : null,
        kind === 'primary'
          ? kit.buttonPrimary
          : kind === 'plain'
            ? kit.buttonPlain
            : kind === 'destructive'
              ? kit.buttonDestructive
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
        style={[
          kit.buttonText,
          size === 'small' ? kit.buttonTextSmall : size === 'large' ? kit.buttonTextLarge : null,
          { color: ink },
        ]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The bar that stays at the bottom of a screen, solid on the cell colour: the
 * screen's one primary action (`size: 'large'` where it is the step to
 * take), an optional secondary one beside it, a figure on the left and a note
 * under it. The screen keeps clear of it with Screen's `bottom` and the
 * height `onHeight` reports.
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
    size?: 'regular' | 'large';
    icon?: IconName;
  };
  secondary?: { label: string; onPress: () => void; disabled?: boolean } | undefined;
  figure?: { label: string; value: string } | undefined;
  note?: string | undefined;
  onHeight?: (height: number) => void;
}) {
  const kit = useKit();
  const insets = useSafeAreaInsets();
  return (
    <View
      testID="bottom-bar"
      style={[kit.bar, { paddingBottom: insets.bottom + spacing.sm }]}
      onLayout={(event) => onHeight?.(event.nativeEvent.layout.height)}
    >
      <View style={kit.barRow}>
        {figure ? (
          <View style={kit.grow}>
            <Caps style={kit.label} numberOfLines={1}>
              {figure.label}
            </Caps>
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
              size={action.size ?? 'regular'}
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
            size={action.size ?? 'regular'}
            icon={action.icon}
          />
        </View>
      </View>
      {note ? <Text style={[kit.caption, kit.center]}>{note}</Text> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Fields and choices
// ---------------------------------------------------------------------------

/** A field on the page: the label above, a 48-high box with the control line, the error in red under it (or a hint). */
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
      <Caps style={[kit.fieldLabel, error ? kit.redText : null]}>{label}</Caps>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textDim}
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
        {checked ? <Icon name="check" size={iconSize.small} color={colors.bg} /> : null}
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

/** Two or three exclusive options side by side in one box: the selected one filled with the ink. */
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

/** A chip: a box with the control line; selected, filled with the ink. Without `onPress`, a plain tag. */
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

/** The search field over a list: a field's box with the magnifier. */
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
      <Icon name="search" size={iconSize.cell} color={colors.textDim} />
      <Input
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? label}
        placeholderTextColor={colors.textDim}
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

/** The tones of a pill: the six of Fulmis (docs/plan-fulmis.md §1.1). */
export type PillTone = StateTone;

export interface PillColors {
  readonly bg: string;
  readonly fg: string;
  /** `null` when the fill alone sets the pill apart. */
  readonly border: string | null;
  /** "Hecho" is the neutral pill with a check: Fulmis has no green. */
  readonly check: boolean;
}

/** The fill, the ink, the outline and the check of a pill of `tone` in a theme. */
export function pillColors(look: Look, tone: PillTone): PillColors {
  const { fill, ink, border } = stateToneColors(look.theme, tone);
  return { bg: fill, fg: ink, border, check: tone === 'done' };
}

/** The check of a pill, as high as its text. */
const PILL_CHECK = iconSize.small - spacing.xs;

/**
 * A short state in its tone: "Disponible", "En revisión", "Vencido". The
 * name says the state and the tone how much it asks, so colour is never the
 * only sign; what is done is the quiet pill with a check.
 */
export function Pill({ label, tone = 'inactive' }: { label: string; tone?: PillTone }) {
  const kit = useKit();
  const { bg, fg, border, check } = pillColors(useTheme(), tone);
  return (
    <View
      style={[
        kit.pill,
        { backgroundColor: bg },
        border ? { borderWidth: 1, borderColor: border } : null,
      ]}
    >
      {check ? <Icon name="check" size={PILL_CHECK} color={fg} /> : null}
      <Caps style={[kit.pillText, { color: fg }]} numberOfLines={1}>
        {label}
      </Caps>
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

export type NoticeTone = 'done' | 'info' | 'warning' | 'danger' | 'attention';

/** The status tone and the icon each notice wears on its mark. */
const NOTICE_MARK: Readonly<Record<NoticeTone, { tone: StateTone; icon: IconName }>> = {
  done: { tone: 'done', icon: 'check' },
  info: { tone: 'progress', icon: 'info' },
  warning: { tone: 'pending', icon: 'warning' },
  danger: { tone: 'problem', icon: 'alert' },
  attention: { tone: 'attention', icon: 'alert' },
};

/**
 * A notice, on the cell colour with a fine line and a mark in its tone:
 * `done` after something went well, `info` for what is under way,
 * `warning` for what waits or is about to expire, `danger` for what failed
 * (read out as an alert) and `attention` for what the person has to do. The
 * title and the icon say it: the colour is never the only sign.
 */
export function Notice({
  tone = 'done',
  title,
  children,
}: {
  tone?: NoticeTone;
  title?: string | undefined;
  children?: ReactNode;
}) {
  const kit = useKit();
  const { theme } = useTheme();
  const mark = NOTICE_MARK[tone];
  const { fill: bg, ink: fg } = stateToneColors(theme, mark.tone);
  return (
    <View accessibilityRole={tone === 'danger' ? 'alert' : undefined} style={kit.notice}>
      <View style={[kit.noticeMark, { backgroundColor: bg }]}>
        <Icon name={mark.icon} size={iconSize.small} color={fg} />
      </View>
      <View style={kit.noticeBody}>
        {title ? <Text style={kit.headline}>{title}</Text> : null}
        {typeof children === 'string' ? <Text style={kit.subheadText}>{children}</Text> : children}
      </View>
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
// The brand block, steps, figures and indicators
// ---------------------------------------------------------------------------

/** Buttons side by side, each as wide as the others: the two secondary ways of a step. */
export function ButtonRow({ children }: { children: ReactNode }) {
  const kit = useKit();
  return (
    <View style={kit.buttonRow}>
      {Children.toArray(children).map((child, i) => (
        <View key={isValidElement(child) && child.key !== null ? child.key : i} style={kit.grow}>
          {child}
        </View>
      ))}
    </View>
  );
}

/** What a brand block holds, read in the Night look whatever the theme. */
function BrandContent({
  mark,
  label,
  title,
  body,
  meta,
  children,
}: {
  mark: boolean;
  label?: string | undefined;
  title?: string | undefined;
  body?: BrandBody;
  meta?: string | undefined;
  children?: ReactNode;
}) {
  const lines = body === undefined ? [] : typeof body === 'string' ? [body] : body;
  const kit = useKit();
  const { colors } = useTheme();
  return (
    <>
      {mark ? (
        <View style={kit.brandMarkRow}>
          <View style={kit.brandMark}>
            <Icon name="swap" size={iconSize.cell} color={colors.accentInk} />
          </View>
          <Text style={kit.title3}>{PLATFORM_NAME}</Text>
        </View>
      ) : null}
      {label || title || lines.length > 0 || meta ? (
        <View style={kit.brandText}>
          {label ? <Caps style={kit.label}>{label}</Caps> : null}
          {title ? (
            <Text accessibilityRole="header" style={kit.brandTitle}>
              {title}
            </Text>
          ) : null}
          {lines.map((line, i) => (
            <Text key={i} style={kit.dim}>
              {line}
            </Text>
          ))}
          {meta ? <Text style={kit.meta}>{meta}</Text> : null}
        </View>
      ) : null}
      {children}
    </>
  );
}

/** The lines of a brand block under its title: one text, or one per line. */
export type BrandBody = string | readonly string[] | undefined;

/**
 * The Night block, the same in both themes: the brand on the way in (`mark`
 * draws it with the platform's name) and, on a trip, "Tu siguiente paso" (a
 * short `label`, the step as `title`, the lines of `body` — the place — and
 * a `meta` line — its window, in Geist Mono). Its children are its actions,
 * and they read the Night look: the one primary of the screen, 56 high, and
 * the secondary ones under it.
 */
export function BrandBlock({
  mark = false,
  label,
  title,
  body,
  meta,
  children,
}: {
  mark?: boolean;
  label?: string | undefined;
  title?: string | undefined;
  body?: BrandBody;
  meta?: string | undefined;
  children?: ReactNode;
}) {
  const kit = useKit();
  return (
    <View style={kit.brand}>
      <BrandSurface>
        <BrandContent mark={mark} label={label} title={title} body={body} meta={meta}>
          {children}
        </BrandContent>
      </BrandSurface>
    </View>
  );
}

/**
 * How far something is along its steps (the four of a trip): a bar per step,
 * filled up to the one in course, and each step's name under its bar with an
 * optional `detail` (an hour). `current` counts from 0; below 0 nothing has
 * started and at the number of steps all are done. `title` names the row and
 * "Paso 2 de 4" sits beside it. `inset={false}` where its parent already
 * gives it the padding of a cell. `labels={false}` leaves the names out of
 * sight where there are too many steps for the width (the five of the
 * sign-up): the title then names the step in course, and a screen reader
 * still hears it.
 */
export function Steps({
  steps,
  current,
  title,
  inset = true,
  labels = true,
}: {
  steps: readonly { label: string; detail?: string | undefined }[];
  current: number;
  title?: string | undefined;
  inset?: boolean;
  labels?: boolean;
}) {
  const kit = useKit();
  const states = stepStates(steps.length, current);
  const number = stepNumber(steps.length, current);
  const count = mobileKitCopy.stepOf(number, steps.length);
  const active = steps[states.indexOf('current')]?.label;
  return (
    <View style={[kit.steps, inset ? kit.stepsInset : null]}>
      <View style={kit.stepsHeader}>
        {title ? <Caps style={[kit.label, kit.grow]}>{title}</Caps> : <View style={kit.grow} />}
        <Text style={kit.meta}>{count}</Text>
      </View>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={title ?? count}
        accessibilityValue={{
          min: 0,
          max: steps.length,
          now: states.filter((state) => state === 'done').length,
          text: active ? `${count}: ${active}` : count,
        }}
        style={kit.stepBars}
      >
        {states.map((state, i) => (
          <View
            key={i}
            style={[
              kit.stepBar,
              state === 'done' ? kit.stepBarDone : state === 'current' ? kit.stepBarCurrent : null,
            ]}
          />
        ))}
      </View>
      {labels ? (
        <View style={kit.stepLabels}>
          {steps.map((step, i) => (
            <View key={i} style={kit.stepLabel}>
              <Text
                style={[
                  kit.stepText,
                  states[i] === 'done'
                    ? kit.stepTextDone
                    : states[i] === 'current'
                      ? kit.stepTextCurrent
                      : null,
                ]}
                numberOfLines={2}
              >
                {step.label}
              </Text>
              {step.detail ? (
                <Text style={kit.meta} numberOfLines={1}>
                  {step.detail}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export type MoneySize = 'numeral' | 'title' | 'headline' | 'body';

/**
 * An amount in pesos from its integer cents, without ".00" on whole pesos
 * (`formatMoney`): `numeral` for the figure of a screen, `title` for the
 * freight of a load, `headline` and `body` inside a row. A short `label` goes
 * over it. Every figure is as wide as the others and never wraps.
 */
export function Money({
  cents,
  size = 'numeral',
  label,
  align = 'left',
}: {
  cents: number | bigint | string;
  size?: MoneySize;
  label?: string | undefined;
  align?: 'left' | 'right';
}) {
  const kit = useKit();
  const right = align === 'right' ? kit.valueText : null;
  const figure = (
    <Text style={[kit[`money${size}`], kit.num, right]} numberOfLines={1} adjustsFontSizeToFit>
      {formatMoney(cents)}
    </Text>
  );
  if (!label) return figure;
  return (
    <View style={kit.money}>
      <Caps style={[kit.label, right]} numberOfLines={1}>
        {label}
      </Caps>
      {figure}
    </View>
  );
}

/**
 * An indicator: a short label, its figure large and a line under it. With
 * `onPress` it opens where the figure comes from. Tiles go in a KpiGrid.
 */
export function KpiTile({
  label,
  value,
  hint,
  onPress,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
  onPress?: (() => void) | undefined;
}) {
  const kit = useKit();
  const content = (
    <>
      <Caps style={kit.label} numberOfLines={2}>
        {label}
      </Caps>
      <Text style={[kit.kpiValue, kit.num]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {hint ? (
        <Text style={kit.footnote} numberOfLines={2}>
          {hint}
        </Text>
      ) : null}
    </>
  );
  if (!onPress) return <View style={kit.kpi}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint ? `${label}: ${value}. ${hint}` : `${label}: ${value}`}
      onPress={onPress}
      style={({ pressed }) => [kit.kpi, pressed ? kit.cellPressed : null]}
    >
      {content}
    </Pressable>
  );
}

/** Indicators in rows of `columns` (2), on one ground with fine lines between them. */
export function KpiGrid({ children, columns = 2 }: { children: ReactNode; columns?: number }) {
  const kit = useKit();
  const rows = chunkRows(Children.toArray(children), columns);
  const width = rows[0]?.length ?? 0;
  return (
    <View style={kit.group}>
      {rows.map((row, r) => (
        <View key={r} style={[kit.kpiRow, r > 0 ? kit.kpiRowNext : null]}>
          {Array.from({ length: width }, (_, c) => (
            <View key={c} style={[kit.grow, c > 0 ? kit.kpiCellNext : null]}>
              {row[c] ?? null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

/** The kit's styles on the colours and type of one theme. */
function makeStyles({ colors, type, theme }: Look) {
  /** The fine line between surfaces. */
  const hairline = { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.separator };
  /** The line of a field or a control. */
  const outline = { borderWidth: 1, borderColor: colors.control };
  const strong = { fontFamily: type.headline.fontFamily };
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
    meta: type.meta,
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
    sectionAction: { ...type.subhead, ...strong, color: colors.accentText },
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
      gap: spacing.xs + spacing.xs / 2,
      minHeight: shape.cellMinHeight,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + spacing.xs / 2,
    },
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
      borderRadius: shape.button,
      borderWidth: 1,
      borderColor: 'transparent',
      paddingHorizontal: spacing.lg,
      flexDirection: 'row',
      gap: spacing.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonSmall: { minHeight: shape.buttonHeightSmall, paddingHorizontal: spacing.md },
    buttonLarge: { minHeight: shape.buttonHeightPrimary },
    buttonPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
    buttonSecondary: { ...outline, backgroundColor: 'transparent' },
    buttonDestructive: { borderColor: colors.redText, backgroundColor: 'transparent' },
    buttonPlain: { backgroundColor: 'transparent', paddingHorizontal: spacing.sm },
    buttonOff: { backgroundColor: colors.surfaceHigh, borderColor: colors.surfaceHigh },
    buttonText: { ...type.headline, textAlign: 'center', flexShrink: 1 },
    buttonTextSmall: { ...type.subhead, ...strong },
    buttonTextLarge: { fontFamily: font[700] },
    buttonRow: { flexDirection: 'row', gap: spacing.sm },
    bar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm + spacing.xs,
      backgroundColor: colors.cell,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.separator,
      overflow: 'hidden',
    },
    barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + spacing.xs },

    field: { gap: spacing.xs + spacing.xs / 2 },
    fieldLabel: type.label,
    input: {
      ...type.body,
      ...outline,
      minHeight: shape.fieldHeight,
      borderRadius: shape.field,
      paddingHorizontal: spacing.sm + spacing.xs,
      backgroundColor: colors.cell,
    },
    inputMultiline: {
      minHeight: shape.fieldHeight * 2,
      paddingTop: spacing.sm + spacing.xs,
      textAlignVertical: 'top',
    },
    inputError: { borderColor: colors.redText },
    // Room at the end of a password box for the button that shows it (D42).
    inputRevealable: { paddingRight: shape.fieldHeight },
    reveal: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      width: shape.fieldHeight,
      alignItems: 'center',
      justifyContent: 'center',
    },
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
      borderColor: colors.control,
      borderRadius: shape.tag,
      backgroundColor: colors.cell,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkBoxOn: { backgroundColor: colors.text, borderColor: colors.text },
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
      ...outline,
      position: 'absolute',
      left: 0,
      right: 0,
      top: SEGMENT_SLOP - spacing.xs / 2,
      bottom: SEGMENT_SLOP - spacing.xs / 2,
      borderRadius: shape.field,
      backgroundColor: colors.cell,
    },
    segment: {
      flex: 1,
      minHeight: SEGMENT_HEIGHT,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: shape.field,
      paddingHorizontal: spacing.sm,
    },
    segmentOn: { backgroundColor: colors.text },
    segmentText: { ...type.subhead, color: colors.textDim },
    segmentTextOn: { ...type.subhead, ...strong, color: colors.bg },
    chip: {
      ...outline,
      minHeight: shape.buttonHeightSmall,
      justifyContent: 'center',
      borderRadius: shape.tag,
      paddingHorizontal: spacing.md,
      backgroundColor: 'transparent',
    },
    chipOn: { borderColor: colors.text, backgroundColor: colors.text },
    chipText: { ...type.subhead, color: colors.text },
    chipTextOn: { ...strong, color: colors.bg },
    // Room above and below the chips for their hit slop (a ScrollView clips).
    chipTabs: { marginHorizontal: -spacing.md, marginVertical: -CHIP_SLOP, flexGrow: 0 },
    chipTabsRow: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: CHIP_SLOP },
    searchBox: {
      ...outline,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: shape.fieldHeight,
      borderRadius: shape.field,
      paddingHorizontal: spacing.sm + spacing.xs,
      backgroundColor: colors.cell,
    },
    searchInput: { ...type.body, flex: 1, paddingVertical: spacing.sm },

    pill: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      minHeight: spacing.lg,
      borderRadius: shape.pill,
      paddingHorizontal: spacing.sm + spacing.xs / 2,
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
      // The line colour reads on the cell in both themes; `surfaceHigh` is lost on Night.
      backgroundColor: colors.separator,
    },
    boneShort: { width: '35%', height: spacing.sm + 2 },
    notice: {
      ...hairline,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm + spacing.xs,
      borderRadius: shape.card,
      padding: spacing.md,
      backgroundColor: colors.cell,
    },
    noticeMark: {
      width: spacing.lg + spacing.xs,
      height: spacing.lg + spacing.xs,
      borderRadius: shape.tag,
      alignItems: 'center',
      justifyContent: 'center',
    },
    noticeBody: { flex: 1, gap: spacing.xs },

    // The Night block: Night itself on Paper, and one step up from the page on Night.
    brand: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.brandLine,
      borderRadius: shape.card,
      backgroundColor: theme === 'dark' ? colors.brandSelected : colors.brandBg,
      padding: spacing.md + spacing.xs,
      gap: spacing.md,
    },
    brandMarkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + spacing.xs },
    brandMark: {
      width: spacing.xl - spacing.xs,
      height: spacing.xl - spacing.xs,
      borderRadius: shape.tag,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    brandText: { gap: spacing.xs + spacing.xs / 2 },
    brandTitle: type.title2,

    steps: { gap: spacing.sm },
    stepsInset: { paddingHorizontal: spacing.md, paddingVertical: spacing.md },
    stepsHeader: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
    stepBars: { flexDirection: 'row', gap: spacing.xs },
    stepBar: { flex: 1, height: spacing.xs, backgroundColor: colors.separator },
    stepBarDone: { backgroundColor: colors.text },
    stepBarCurrent: { backgroundColor: colors.accent },
    stepLabels: { flexDirection: 'row', gap: spacing.xs },
    stepLabel: { flex: 1, gap: 1 },
    stepText: { ...type.caption, ...strong, color: colors.textDim },
    stepTextDone: { color: colors.text },
    stepTextCurrent: { fontFamily: font[700], color: colors.accentText },

    money: { gap: spacing.xs / 2 },
    moneynumeral: type.numeral,
    moneytitle: type.title2,
    moneyheadline: type.headline,
    moneybody: type.body,
    kpi: { flex: 1, gap: spacing.xs, padding: spacing.md },
    kpiValue: type.numeral,
    kpiRow: { flexDirection: 'row' },
    kpiRowNext: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
    kpiCellNext: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.separator },
  });
}

const KIT = { light: makeStyles(lookOf('light')), dark: makeStyles(lookOf('dark')) };

function useKit() {
  return KIT[useTheme().theme];
}
