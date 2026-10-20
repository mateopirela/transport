'use client';

/** A chip that holds a native checkbox: the chip follows it (keyboard, forms and tests stay native). */
export const checkboxChip =
  'inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border bg-cell px-3.5 text-subhead text-text transition-colors duration-200 select-none hover:bg-surface-high/60 has-checked:border-transparent has-checked:bg-accent-soft has-checked:text-accent-text has-focus-visible:ring-[3px] has-focus-visible:ring-ring/40';

/**
 * Several options to tick (features of a unit, unit types of a route) as a
 * row of chips under a `label`. Controlled: React resets uncontrolled inputs
 * after every submit, so a failed save would lose what was ticked.
 */
export function CheckboxList({
  legend,
  name,
  options,
  checked,
  onChange,
}: {
  legend: string;
  name: string;
  options: readonly { value: string; label: string }[];
  checked: readonly string[];
  onChange: (next: readonly string[]) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 px-1 text-label text-text-dim">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label key={option.value} className={checkboxChip}>
            <input
              type="checkbox"
              name={name}
              value={option.value}
              checked={checked.includes(option.value)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...checked, option.value]
                    : checked.filter((value) => value !== option.value),
                )
              }
              className="size-4 accent-accent"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
