'use client';

import { appearanceCopy, THEME_CHOICES, type ThemeChoice } from '@transport/shared';

import { Segmented } from '@/components/ui/segmented';
import { themeClass, themeCookie } from '@/lib/theme';

const ITEMS = THEME_CHOICES.map((value) => ({ value, label: appearanceCopy[value] }));

/** Keeps a choice in the `theme` cookie (read by the root layout) and applies it on `<html>` at once. */
function applyTheme(choice: ThemeChoice) {
  // The choice is a preference of this browser, read back by the root layout.
  document.cookie = themeCookie(choice, window.location.protocol === 'https:');
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  const cls = themeClass(choice);
  if (cls) root.classList.add(cls);
}

/**
 * "Apariencia" (D26) in the account menu: Sistema, Claro or Oscuro. It is
 * controlled: the menu that holds it keeps the choice, so closing and
 * reopening the menu shows the theme in use.
 */
export function ThemeSwitcher({
  value,
  onChange,
  className,
}: {
  value: ThemeChoice;
  onChange: (choice: ThemeChoice) => void;
  className?: string;
}) {
  return (
    <Segmented
      label={appearanceCopy.title}
      items={ITEMS}
      value={value}
      onChange={(next) => {
        applyTheme(next);
        onChange(next);
      }}
      className={className}
    />
  );
}
