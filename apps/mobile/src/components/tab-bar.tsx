import type { Tabs } from 'expo-router/js-tabs';
import { useEffect, useState, type ComponentProps } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { badgeText } from '../lib/kit';
import { font, iconSize, lookOf, shape, spacing, tabBar, useTheme, type Look } from '../theme';
import { Icon, type IconName } from './icons';
import { tabBarBottom } from './ui';

export type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

/**
 * What a screen reader (and Maestro) reads on a tab: the label of React
 * Navigation's own bar, "<label>, tab, <n> of <m>", counted over every route
 * of the navigator, hidden ones included, exactly as that bar counts them.
 */
export function tabAccessibilityLabel(label: string, index: number, count: number): string {
  return `${label}, tab, ${index + 1} of ${count}`;
}

/** A route declared with `href: null` (a screen of the tabs that is not a tab). */
function isHidden(options: TabBarProps['descriptors'][string]['options']): boolean {
  return StyleSheet.flatten(options.tabBarItemStyle)?.display === 'none';
}

/** The keyboard is up (Android lays the bar over it otherwise). */
function useKeyboardShown(): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setShown(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return shown;
}

/**
 * The tab bar of the system (docs/plan-fulmis.md §1.5): solid, the cell
 * colour from edge to edge on the bottom of the screen under a fine line,
 * with no shadow and nothing seen through it. The selected tab reads in the
 * accent's text colour, heavier and with its filled icon; no tab is a filled
 * button. A tab whose `tabBarBadge` is set carries its count on the accent.
 * Screens keep clear of it through TabScreens and Screen (components/ui.tsx).
 */
export function TabBar({
  state,
  descriptors,
  navigation,
  icons,
}: TabBarProps & { icons: Readonly<Record<string, IconName>> }) {
  const { theme, colors } = useTheme();
  const styles = STYLES[theme];
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardShown();
  if (keyboard && Platform.OS === 'android') return null;

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.bar, { paddingBottom: tabBarBottom(insets.bottom) }]}
    >
      <View style={styles.tabs}>
        {state.routes.map((route, index) => {
          const descriptor = descriptors[route.key];
          if (!descriptor || isHidden(descriptor.options)) return null;
          const { options } = descriptor;
          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : (options.title ?? route.name);
          const focused = state.index === index;
          const tint = focused ? colors.accentText : colors.textDim;
          const badge = badgeText(options.tabBarBadge);
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tabAccessibilityLabel(label, index, state.routes.length)}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
              }}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              style={styles.tab}
            >
              <View>
                <Icon
                  name={icons[route.name] ?? 'more'}
                  size={iconSize.regular}
                  color={tint}
                  filled={focused}
                />
                {badge ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{badge}</Text>
                  </View>
                ) : null}
              </View>
              <Text
                style={[styles.label, { color: tint }, focused ? styles.labelOn : null]}
                numberOfLines={1}
              >
                {label}
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
    bar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingTop: tabBar.padding,
      paddingHorizontal: tabBar.side,
      backgroundColor: colors.cell,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.separator,
    },
    tabs: { flexDirection: 'row', height: tabBar.item },
    tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
    label: { ...type.caption, fontFamily: font[600] },
    labelOn: { fontFamily: font[700] },
    badge: {
      position: 'absolute',
      top: -spacing.xs,
      left: iconSize.regular - spacing.sm,
      minWidth: iconSize.small + 1,
      height: iconSize.small + 1,
      borderRadius: shape.pill,
      paddingHorizontal: spacing.xs,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accent,
    },
    badgeText: {
      ...type.caption,
      ...type.num,
      fontFamily: font[700],
      lineHeight: iconSize.small,
      color: colors.accentInk,
    },
  });
}

const STYLES = { light: makeStyles(lookOf('light')), dark: makeStyles(lookOf('dark')) };
