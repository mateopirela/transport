'use client';

import { appearanceCopy, THEME_CHOICES, type ThemeChoice } from '@transport/shared';
import { useState } from 'react';

import { Segmented } from '@/components/ui/segmented';
import { themeClass, themeCookie } from '@/lib/theme';

const ITEMS = THEME_CHOICES.map((value) => ({ value, label: appearanceCopy[value] }));

/**
 * "Apariencia" (D26) in the account menu: Sistema, Claro or Oscuro. The choice
 * goes to the `theme` cookie (read by the root layout on the next request) and
 * applies at once on `<html>`.
 */
export function ThemeSwitcher({
  initial,
  className,
}: {
  initial: ThemeChoice;
  className?: string;
}) {
  const [choice, setChoice] = useState(initial);

  function choose(next: ThemeChoice) {
    setChoice(next);
    // The choice is a preference of this browser, read back by the root layout.
    document.cookie = themeCookie(next, window.location.protocol === 'https:');
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    const cls = themeClass(next);
    if (cls) root.classList.add(cls);
  }

  return (
    <Segmented
      label={appearanceCopy.title}
      items={ITEMS}
      value={choice}
      onChange={choose}
      className={className}
    />
  );
}
