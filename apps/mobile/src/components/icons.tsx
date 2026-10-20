import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

import { iconSize } from '../theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/**
 * The icons of the app (docs/plan-rediseno.md §1.4): Ionicons outline, line
 * of 2 with round ends, 24 by default. Screens name an icon by what it means
 * here, never by its Ionicons name, so the set can change in one place. The
 * filled glyph is only for the selected tab.
 */
const GLYPHS = {
  home: 'home-outline',
  units: 'bus-outline',
  loads: 'cube-outline',
  trips: 'map-outline',
  more: 'menu-outline',
  navigate: 'navigate-outline',
  locate: 'locate-outline',
  location: 'location-outline',
  route: 'git-commit-outline',
  time: 'time-outline',
  calendar: 'calendar-outline',
  document: 'document-text-outline',
  documents: 'documents-outline',
  camera: 'camera-outline',
  image: 'image-outline',
  person: 'person-outline',
  people: 'people-outline',
  company: 'business-outline',
  chat: 'chatbubble-outline',
  send: 'send-outline',
  share: 'share-outline',
  link: 'link-outline',
  phone: 'call-outline',
  mail: 'mail-outline',
  lock: 'lock-closed-outline',
  key: 'key-outline',
  notifications: 'notifications-outline',
  search: 'search-outline',
  add: 'add',
  close: 'close',
  check: 'checkmark',
  checkCircle: 'checkmark-circle-outline',
  alert: 'alert-circle-outline',
  warning: 'warning-outline',
  info: 'information-circle-outline',
  offline: 'cloud-offline-outline',
  refresh: 'refresh-outline',
  trash: 'trash-outline',
  edit: 'create-outline',
  money: 'cash-outline',
  appearance: 'contrast-outline',
  legal: 'shield-checkmark-outline',
  signOut: 'log-out-outline',
  chevronRight: 'chevron-forward',
  chevronDown: 'chevron-down',
  chevronBack: 'chevron-back',
} as const satisfies Record<string, IoniconName>;

export type IconName = keyof typeof GLYPHS;

/** The filled glyph of the selected tab; the outline one where there is none. */
const FILLED: Partial<Record<IconName, IoniconName>> = {
  home: 'home',
  units: 'bus',
  loads: 'cube',
  trips: 'map',
  more: 'menu',
  navigate: 'navigate',
};

/** The Ionicons name of an icon (exported for the tests and the tab bar). */
export function glyphOf(name: IconName, filled = false): IoniconName {
  return (filled ? FILLED[name] : undefined) ?? GLYPHS[name];
}

/** An icon of the set. Decorative: the row or button it sits in carries the label. */
export function Icon({
  name,
  color,
  size = iconSize.regular,
  filled = false,
}: {
  name: IconName;
  color: string;
  size?: number;
  filled?: boolean;
}) {
  return (
    <Ionicons
      name={glyphOf(name, filled)}
      size={size}
      color={color}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
