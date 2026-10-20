import { BlurView } from 'expo-blur';
import type { Tabs } from 'expo-router/js-tabs';
import { useEffect, useState, type ComponentProps } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  font,
  iconSize,
  lookOf,
  shadows,
  shape,
  spacing,
  tabBar,
  useTheme,
  type Look,
} from '../theme';
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
 * The floating tab bar of the system (§1.6): a frosted pill 16 from each
 * side over the bottom edge, with the one allowed soft shadow; the selected
 * tab on the cell colour with its filled icon and the accent; a count on a
 * tab whose `tabBarBadge` is set. Screens keep clear of it through
 * TabScreens and Screen (components/ui.tsx).
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
      pointerEvents="box-none"
      style={[styles.float, { bottom: tabBarBottom(insets.bottom) }]}
    >
      <View style={styles.shadow}>
        <BlurView intensity={40} tint={theme} style={styles.bar}>
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
            const badge = options.tabBarBadge;
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
                style={[styles.tab, focused ? styles.tabOn : null]}
              >
                <View>
                  <Icon
                    name={icons[route.name] ?? 'more'}
                    size={iconSize.regular}
                    color={tint}
                    filled={focused}
                  />
                  {badge !== undefined && badge !== '' && badge !== 0 ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{String(badge)}</Text>
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
        </BlurView>
      </View>
    </View>
  );
}

function makeStyles({ colors, type }: Look) {
  const inner = tabBar.height - tabBar.padding * 2;
  return StyleSheet.create({
    float: { position: 'absolute', left: tabBar.side, right: tabBar.side },
    // The floating tab bar carries one of the two shadows of the system (§1.3).
    shadow: { borderRadius: shape.pill, ...shadows.tabBar },
    bar: {
      flexDirection: 'row',
      height: tabBar.height,
      padding: tabBar.padding,
      borderRadius: shape.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.glassLine,
      backgroundColor: colors.glass,
      overflow: 'hidden',
    },
    tab: {
      flex: 1,
      height: inner,
      borderRadius: shape.pill,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    tabOn: { backgroundColor: colors.cell, ...shadows.segment },
    label: { ...type.caption, fontFamily: font[500] },
    labelOn: { fontFamily: font[600] },
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
      fontFamily: font[600],
      lineHeight: iconSize.small,
      color: colors.accentInk,
    },
  });
}

const STYLES = { light: makeStyles(lookOf('light')), dark: makeStyles(lookOf('dark')) };
