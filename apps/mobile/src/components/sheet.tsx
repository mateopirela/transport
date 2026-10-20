import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { mobileErrorCopy } from '@transport/shared';
import {
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { matchesQuery } from '../lib/fold';
import { lookOf, opacity, shape, spacing, useTheme, type Look } from '../theme';
import { Button, Cell, ErrorText, Footnote, Group, SearchBox } from './ui';

export { fold } from '../lib/fold';

/**
 * The bottom sheets of the system (@gorhom/bottom-sheet, §1.5): a grabber,
 * the cell colour with the top corners at 28, a dim backdrop, the height of
 * their content. Where a short task lives: confirming a step, choosing an
 * option, picking from a long list. Opened and closed through their handle.
 * They need the BottomSheetModalProvider of the root layout.
 */
export interface SheetHandle {
  open: () => void;
  close: () => void;
}

/** How much of the room under the status bar the tallest sheet takes. */
const LARGE = 0.92;

export function Sheet({
  ref,
  children,
  title,
  note,
  large = false,
  onClose,
}: {
  ref: Ref<SheetHandle>;
  children: ReactNode;
  /** The title, in `title3`, with an optional note on its right ("Paso 1 de 3"). */
  title?: string | undefined;
  note?: string | undefined;
  /** A fixed tall sheet, for a list narrowed by a search; otherwise it takes its content's height. */
  large?: boolean;
  onClose?: () => void;
}) {
  const styles = STYLES[useTheme().theme];
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const modal = useRef<BottomSheetModal>(null);
  const topInset = insets.top + spacing.sm;

  useImperativeHandle(
    ref,
    () => ({ open: () => modal.current?.present(), close: () => modal.current?.dismiss() }),
    [],
  );

  const backdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={opacity.backdrop}
        pressBehavior="close"
      />
    ),
    [],
  );

  return (
    <BottomSheetModal
      ref={modal}
      snapPoints={large ? [`${LARGE * 100}%`] : undefined}
      enableDynamicSizing={!large}
      maxDynamicContentSize={(height - topInset) * LARGE}
      topInset={topInset}
      backdropComponent={backdrop}
      backgroundStyle={styles.sheet}
      handleIndicatorStyle={styles.grabber}
      onDismiss={onClose}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      stackBehavior="push"
      accessible={false}
    >
      <BottomSheetScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.lg }]}
        alwaysBounceVertical={false}
        keyboardShouldPersistTaps="handled"
      >
        {title || note ? (
          <View style={styles.head}>
            {title ? (
              <Text accessibilityRole="header" style={[styles.title, styles.grow]}>
                {title}
              </Text>
            ) : null}
            {note ? <Text style={styles.note}>{note}</Text> : null}
          </View>
        ) : null}
        {children}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

/** What a step that cannot be undone asks before it runs. */
export interface Confirmation {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  /** A cancellation or a removal reads in red. */
  readonly destructive?: boolean;
  /**
   * The step itself. When it fails (throws or rejects), the sheet stays open
   * with `errorMessage` under the body so the person can try again.
   */
  readonly onConfirm: () => void | Promise<void>;
  /** What the sheet says when the step fails; by default, the app's generic error. */
  readonly errorMessage?: string;
}

export interface ConfirmSheetHandle {
  ask: (confirmation: Confirmation) => void;
}

/**
 * A confirmation in a sheet, in place of an alert: what will happen, the
 * step's own label and the way back. Nothing runs until the person confirms;
 * the sheet closes once the step went through.
 */
export function ConfirmSheet({ ref }: { ref: Ref<ConfirmSheetHandle> }) {
  const styles = STYLES[useTheme().theme];
  const sheet = useRef<SheetHandle>(null);
  const [pending, setPending] = useState<Confirmation | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      ask: (confirmation) => {
        setPending(confirmation);
        setFailed(false);
        sheet.current?.open();
      },
    }),
    [],
  );

  async function confirm() {
    if (!pending || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await pending.onConfirm();
    } catch {
      // The step did not go through: stay open, say so, and let the person retry.
      setBusy(false);
      setFailed(true);
      return;
    }
    setBusy(false);
    sheet.current?.close();
  }

  return (
    <Sheet
      ref={sheet}
      title={pending?.title}
      onClose={() => {
        setPending(null);
        setFailed(false);
      }}
    >
      <Text style={styles.body17}>{pending?.body}</Text>
      {failed ? <ErrorText>{pending?.errorMessage ?? mobileErrorCopy.unknown}</ErrorText> : null}
      <Button
        label={pending?.confirmLabel ?? ''}
        variant={pending?.destructive ? 'destructive' : 'primary'}
        loading={busy}
        onPress={() => void confirm()}
      />
      <Button
        label={pending?.cancelLabel ?? ''}
        variant="plain"
        onPress={() => sheet.current?.close()}
      />
    </Sheet>
  );
}

/** A choice among a few options, as the phone's own settings: a group of rows, the chosen one with a check. */
export function OptionSheet<T extends string>({
  ref,
  title,
  options,
  value,
  onChange,
  footnote,
}: {
  ref: Ref<SheetHandle>;
  title: string;
  options: readonly { value: T; label: string }[];
  value: T | undefined;
  onChange: (value: T) => void;
  footnote?: string;
}) {
  const sheet = useRef<SheetHandle>(null);
  useImperativeHandle(
    ref,
    () => ({ open: () => sheet.current?.open(), close: () => sheet.current?.close() }),
    [],
  );
  return (
    <Sheet ref={sheet} title={title}>
      <View accessibilityRole="radiogroup" accessibilityLabel={title}>
        <Group>
          {options.map((option) => (
            <Cell
              key={option.value}
              role="radio"
              title={option.label}
              checked={option.value === value}
              onPress={() => {
                onChange(option.value);
                sheet.current?.close();
              }}
            />
          ))}
        </Group>
      </View>
      {footnote ? <Footnote>{footnote}</Footnote> : null}
    </Sheet>
  );
}

/**
 * A long list to choose one from (a state, a city): a search on top and the
 * rows under it, the chosen one with a check. Typing narrows the rows,
 * ignoring accents; tapping one takes it and closes the sheet.
 */
export function PickerSheet<T>({
  ref,
  title,
  searchLabel,
  none,
  items,
  keyOf,
  labelOf,
  subtitleOf,
  selected,
  onChoose,
}: {
  ref: Ref<SheetHandle>;
  title: string;
  searchLabel: string;
  /** The line shown when nothing matches. */
  none: string;
  items: readonly T[];
  keyOf: (item: T) => string;
  labelOf: (item: T) => string;
  subtitleOf?: (item: T) => string | undefined;
  selected?: string | null | undefined;
  onChoose: (item: T) => void;
}) {
  const sheet = useRef<SheetHandle>(null);
  const [query, setQuery] = useState('');
  useImperativeHandle(
    ref,
    () => ({ open: () => sheet.current?.open(), close: () => sheet.current?.close() }),
    [],
  );
  const shown = items.filter((item) => matchesQuery(labelOf(item), query));
  return (
    <Sheet ref={sheet} title={title} large onClose={() => setQuery('')}>
      <SearchBox inSheet label={searchLabel} value={query} onChangeText={setQuery} />
      {shown.length === 0 ? (
        <Footnote>{none}</Footnote>
      ) : (
        <View accessibilityRole="radiogroup" accessibilityLabel={title}>
          <Group>
            {shown.map((item) => (
              <Cell
                key={keyOf(item)}
                role="radio"
                title={labelOf(item)}
                subtitle={subtitleOf?.(item)}
                checked={selected === keyOf(item)}
                onPress={() => {
                  onChoose(item);
                  sheet.current?.close();
                }}
              />
            ))}
          </Group>
        </View>
      )}
    </Sheet>
  );
}

function makeStyles({ colors, type }: Look) {
  return StyleSheet.create({
    grow: { flex: 1 },
    // No shadow: the backdrop sets the sheet apart (§1.3).
    sheet: {
      backgroundColor: colors.cell,
      borderTopLeftRadius: shape.sheet,
      borderTopRightRadius: shape.sheet,
    },
    grabber: { backgroundColor: colors.separator },
    head: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
    title: type.title3,
    note: type.footnote,
    body17: type.body,
    body: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.md },
  });
}

const STYLES = { light: makeStyles(lookOf('light')), dark: makeStyles(lookOf('dark')) };
