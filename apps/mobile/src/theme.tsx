/**
 * The look of the app: "Fulmis" (D26-E2, docs/plan-fulmis.md §1). Paper is
 * the light theme and Night the dark one; two families (Geist, and Geist Mono
 * for labels and metadata), one accent, hairlines and no shadow, no glass.
 * The person chooses between light, dark or the phone's, kept on the phone.
 *
 * The colours come from @transport/shared (design/tokens.ts). Components read
 * them through useTheme(), so the whole app changes theme at once.
 */
import { GeistMono_500Medium } from '@expo-google-fonts/geist-mono/500Medium';
import { GeistMono_700Bold } from '@expo-google-fonts/geist-mono/700Bold';
import { Geist_400Regular } from '@expo-google-fonts/geist/400Regular';
import { Geist_500Medium } from '@expo-google-fonts/geist/500Medium';
import { Geist_600SemiBold } from '@expo-google-fonts/geist/600SemiBold';
import { Geist_700Bold } from '@expo-google-fonts/geist/700Bold';
import { Geist_800ExtraBold } from '@expo-google-fonts/geist/800ExtraBold';
import { Geist_900Black } from '@expo-google-fonts/geist/900Black';
import {
  DEFAULT_THEME_CHOICE,
  mixColors,
  palette,
  parseThemeChoice,
  resolveTheme,
  shape,
  SOFT_ALPHA,
  spacing as tokenSpacing,
  typeScale,
  type FontWeight,
  type Theme,
  type ThemeChoice,
  type TypeName,
} from '@transport/shared';
import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet, useColorScheme, type TextStyle } from 'react-native';

export { radii, shape } from '@transport/shared';

export const spacing = tokenSpacing;

/** Icon sizes (§1.4): 24 in a tab or a row that navigates, 20 inside a cell, 16 for a chevron. */
export const iconSize = Object.freeze({ regular: 24, cell: 20, small: 16 });

/**
 * The floating tab bar: a solid pill `height` high, `side` from each edge,
 * `inset` over the bottom edge where the phone has none. Screens in the tabs
 * keep clear of it (Screen does it).
 */
export const tabBar = Object.freeze({
  height: 66,
  side: spacing.md,
  inset: spacing.md,
  padding: 7,
});

/** Durations of the system's motion (§1.5), in milliseconds. */
export const motion = Object.freeze({ fast: 150, standard: 250, pulse: 700 });

/** How see-through a pressed control and a disabled one are. */
export const opacity = Object.freeze({ pressed: 0.7, disabled: 0.5, backdrop: 0.4 });

/** What useFonts loads before the splash hides. The keys are the family names. */
export const fontFiles = {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
  Geist_800ExtraBold,
  Geist_900Black,
  GeistMono_500Medium,
  GeistMono_700Bold,
};

/** One family per weight: React Native picks a loaded font by its name. */
export const font: Record<FontWeight, keyof typeof fontFiles> = {
  400: 'Geist_400Regular',
  500: 'Geist_500Medium',
  600: 'Geist_600SemiBold',
  700: 'Geist_700Bold',
  800: 'Geist_800ExtraBold',
  900: 'Geist_900Black',
};

/** Geist Mono has two weights (§1.2): the medium of metadata and the bold of a label. */
export const monoFont: Record<FontWeight, keyof typeof fontFiles> = {
  400: 'GeistMono_500Medium',
  500: 'GeistMono_500Medium',
  600: 'GeistMono_700Bold',
  700: 'GeistMono_700Bold',
  800: 'GeistMono_700Bold',
  900: 'GeistMono_700Bold',
};

/** Where the person's choice is kept (SecureStore keys take letters, digits, ".", "-" and "_"). */
const THEME_STORE_KEY = 'transport.theme';

/** What the app shows before the person chooses: the phone's theme (every screen reads it). */
export const APP_DEFAULT_THEME_CHOICE: ThemeChoice = DEFAULT_THEME_CHOICE;

/** The colours of one theme, with the soft red of a danger notice (the tone at 14 % on `cell`). */
function colorsOf(theme: Theme) {
  const c = palette[theme];
  return Object.freeze({ ...c, redSoft: mixColors(c.red, c.cell, SOFT_ALPHA) });
}

export type AppColors = ReturnType<typeof colorsOf>;

const COLORS: Record<Theme, AppColors> = { light: colorsOf('light'), dark: colorsOf('dark') };

function textStyle(name: TypeName, color: string): TextStyle {
  const s = typeScale[name];
  return {
    fontFamily: s.family === 'mono' ? monoFont[s.weight] : font[s.weight],
    fontSize: s.size,
    lineHeight: s.lineHeight,
    letterSpacing: s.letterSpacing,
    ...(s.uppercase ? { textTransform: 'uppercase' as const } : null),
    color,
  };
}

/** The text and box styles of one theme. Built once per theme. */
function makeLook(theme: Theme) {
  const c = COLORS[theme];
  const type = StyleSheet.create({
    largeTitle: textStyle('largeTitle', c.text),
    title1: textStyle('title1', c.text),
    title2: textStyle('title2', c.text),
    title3: textStyle('title3', c.text),
    headline: textStyle('headline', c.text),
    body: textStyle('body', c.text),
    callout: textStyle('callout', c.text),
    subhead: textStyle('subhead', c.text),
    footnote: textStyle('footnote', c.textDim),
    caption: textStyle('caption', c.textDim),
    label: textStyle('label', c.textDim),
    meta: textStyle('meta', c.textDim),
    numeral: textStyle('numeral', c.text),
    /** Money, dates and plates: every figure the same width. */
    num: { fontVariant: ['tabular-nums'] },
  });
  const box = StyleSheet.create({
    /** A group of cells without padding, for rows that reach its edges. */
    group: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
      borderRadius: shape.card,
      backgroundColor: c.cell,
      overflow: 'hidden',
    },
    /** A card: the same, with padding. */
    card: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
      borderRadius: shape.card,
      backgroundColor: c.cell,
      padding: spacing.md,
    },
    /** A notice after something went well. */
    notice: { borderRadius: shape.card, backgroundColor: c.highlight, padding: spacing.md },
    /** The page. */
    page: { flex: 1, backgroundColor: c.bg },
  });
  return { theme, colors: c, type, box };
}

export type Look = ReturnType<typeof makeLook>;

const LOOKS: Record<Theme, Look> = { light: makeLook('light'), dark: makeLook('dark') };

/** The look of a theme, for styles built once per theme at module load. */
export function lookOf(theme: Theme): Look {
  return LOOKS[theme];
}

interface ThemeValue extends Look {
  /** What the person chose: a theme, or to follow the phone. */
  readonly choice: ThemeChoice;
  readonly setChoice: (choice: ThemeChoice) => void;
  /** False until the saved choice was read, so the first screen is already in the right theme. */
  readonly ready: boolean;
}

const ThemeContext = createContext<ThemeValue>({
  ...LOOKS.light,
  choice: APP_DEFAULT_THEME_CHOICE,
  setChoice: () => undefined,
  ready: true,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const [choice, setStoredChoice] = useState<ThemeChoice>(APP_DEFAULT_THEME_CHOICE);
  const [ready, setReady] = useState(false);
  // A choice made while the saved one is still being read wins over it.
  const chosen = useRef(false);

  useEffect(() => {
    let cancelled = false;
    SecureStore.getItemAsync(THEME_STORE_KEY)
      .then((saved) => {
        const parsed = parseThemeChoice(saved);
        if (!cancelled && !chosen.current && parsed) setStoredChoice(parsed);
      })
      .catch(() => undefined)
      // Read or not, the app opens: without a saved choice it is the default.
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setChoice = useCallback((next: ThemeChoice) => {
    chosen.current = true;
    setStoredChoice(next);
    // A choice that could not be saved still applies until the app closes.
    SecureStore.setItemAsync(THEME_STORE_KEY, next).catch(() => undefined);
  }, []);

  const value = useMemo<ThemeValue>(
    () => ({ ...LOOKS[resolveTheme(choice, scheme)], choice, setChoice, ready }),
    [choice, scheme, setChoice, ready],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** The theme in force: its colours, text and box styles, and the person's choice. */
export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}

/** Styles that depend on the colours of the theme, rebuilt only when the theme changes. */
export function useStyles<T>(factory: (colors: AppColors) => T): T {
  const { colors: current } = useTheme();
  return useMemo(() => factory(current), [factory, current]);
}

/** Header and page of every stack: the page colour, no shadow, the title in `headline`, a minimal back button. */
export function useStackScreenOptions() {
  const { colors: c, type } = useTheme();
  return useMemo(
    () =>
      ({
        headerTintColor: c.accentText,
        headerStyle: { backgroundColor: c.bg },
        headerShadowVisible: false,
        headerTitleStyle: {
          fontFamily: type.headline.fontFamily,
          fontSize: type.headline.fontSize,
          color: c.text,
        },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: c.bg },
      }) as const,
    [c, type],
  );
}

/** Tabs of every tab navigator: no header (the screens open with a large title), the page colour behind. The bar is components/tab-bar.tsx. */
export function useTabsScreenOptions() {
  const { colors: c } = useTheme();
  return useMemo(
    () => ({ headerShown: false, sceneStyle: { backgroundColor: c.bg } }) as const,
    [c],
  );
}
