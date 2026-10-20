/** Lower case without accents, so "queretaro" finds "Querétaro" (the kit's searches). */
export function fold(text: string): string {
  // After NFD, an accent is a combining mark of its own (U+0300 to U+036F).
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Whether `text` holds what was typed, ignoring accents, case and the spaces around it. */
export function matchesQuery(text: string, query: string): boolean {
  const q = fold(query.trim());
  return q === '' || fold(text).includes(q);
}
