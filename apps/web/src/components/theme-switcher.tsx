'use client';

import {
  appearanceCopy,
  THEME_CHOICES,
  parseThemeChoice,
  type ThemeChoice,
} from '@transport/shared';
import { useState } from 'react';

import { themeClass, themeCookie } from '@/lib/theme';
import { cn } from '@/lib/utils';

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

  function choose(value: string) {
    const next = parseThemeChoice(value);
    if (!next) return;
    setChoice(next);
    // The choice is a preference of this browser, read back by the root layout.
    document.cookie = themeCookie(next, window.location.protocol === 'https:');
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    const cls = themeClass(next);
    if (cls) root.classList.add(cls);
  }

  return (
    <select
      aria-label={appearanceCopy.title}
      value={choice}
      onChange={(event) => choose(event.target.value)}
      className={cn(
        'h-8 cursor-pointer rounded-full border bg-transparent px-2 text-sm sm:px-3 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        className,
      )}
    >
      {THEME_CHOICES.map((option) => (
        <option key={option} value={option}>
          {appearanceCopy[option]}
        </option>
      ))}
    </select>
  );
}
