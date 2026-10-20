/**
 * Up to two initials for the account button: the first letters of the first
 * two words ("Ana López" → "AL"), or "" when there is no name.
 */
export function initialsOf(name: string | null | undefined): string {
  return (name ?? '')
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0]?.toLocaleUpperCase('es-MX') ?? '')
    .join('');
}

/** A section of the top bar of a signed-in area. */
export interface NavItem {
  href: string;
  /** The part of the site the section stands for, when wider than `href` (e.g. the whole fleet). */
  match?: string;
}

function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * The section of `pathname` among `items`: the one whose part of the site is
 * the longest that contains it. The area's home (the section every other one
 * lives under, like /cliente) only counts on its own page, so a screen
 * outside every section (e.g. /transportista/rutas) leaves none chosen.
 * Returns the chosen item's `href`, or `null`.
 */
export function activeNavHref(pathname: string, items: readonly NavItem[]): string | null {
  let best: { href: string; length: number } | null = null;
  for (const item of items) {
    const base = item.match ?? item.href;
    const isHome = items.every(
      (other) => other === item || isUnder(other.match ?? other.href, base),
    );
    const matches = isHome && items.length > 1 ? pathname === base : isUnder(pathname, base);
    if (matches && (!best || base.length > best.length)) {
      best = { href: item.href, length: base.length };
    }
  }
  return best?.href ?? null;
}
