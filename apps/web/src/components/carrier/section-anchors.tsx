/**
 * The anchors over the long sections of a detail (docs/plan-fulmis.md §1.5):
 * a line of links on a hairline that jump to each section's `id`.
 */
export function SectionAnchors({
  label,
  items,
}: {
  /** What the sections are of, for a screen reader. */
  label: string;
  items: readonly { id: string; label: string }[];
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-x-5 gap-y-2 border-b pb-3">
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className="rounded-sm text-footnote font-semibold text-text-dim transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
