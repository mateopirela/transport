import { Platform } from 'react-native';

// Base visual theme, aligned with the deck: navy, blue accent and serif titles.
export const colors = {
  navy: '#0B1F3A',
  accent: '#2563EB',
  accentPressed: '#1D4ED8',
  background: '#F5F7FB',
  surface: '#FFFFFF',
  text: '#0B1F3A',
  textMuted: '#5B6B82',
  border: '#D5DCE6',
  danger: '#B42318',
  dangerSurface: '#FEF3F2',
  warning: '#B54708',
  warningSurface: '#FFFAEB',
  info: '#1D4ED8',
  infoSurface: '#EFF4FF',
  onAccent: '#FFFFFF',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export const fonts = {
  title: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
} as const;
