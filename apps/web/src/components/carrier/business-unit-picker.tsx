'use client';

import { carrierWebCopy, fleetCopy } from '@transport/shared';
import { usePathname } from 'next/navigation';
import { useRef } from 'react';

import { Button } from '@/components/ui/button';
import { selectBusinessUnit } from '@/lib/carrier/actions';
import { ALL_BUSINESS_UNITS, type BusinessUnitOption } from '@/lib/carrier/business-units';

const c = carrierWebCopy.businessUnit;

/**
 * Business unit picker of the carrier web (D19): the Gerente chooses one of
 * the company's units or all of them; a Coordinador with several units,
 * one of theirs. With one unit there is nothing to choose, and without any
 * (a Coordinador not yet assigned) the screens show nothing of the fleet.
 * Changing the select submits the form; the button is there for keyboards
 * and browsers without JavaScript.
 */
export function BusinessUnitPicker({
  operable,
  selectedId,
}: {
  operable: readonly BusinessUnitOption[];
  selectedId: string | null;
}) {
  const pathname = usePathname();
  const form = useRef<HTMLFormElement>(null);
  if (operable.length === 0) {
    return <p className="text-xs text-muted-foreground">{c.none}</p>;
  }
  const [only] = operable;
  if (operable.length === 1 && only) {
    return <p className="text-xs text-muted-foreground">{fleetCopy.businessUnit(only.name)}</p>;
  }
  return (
    <form ref={form} action={selectBusinessUnit} className="flex items-center gap-2">
      <input type="hidden" name="volver" value={pathname} />
      <label htmlFor="business-unit" className="text-xs text-muted-foreground">
        {c.label}
      </label>
      <select
        id="business-unit"
        name="unidad"
        defaultValue={selectedId ?? ALL_BUSINESS_UNITS}
        onChange={() => form.current?.requestSubmit()}
        className="h-8 max-w-56 rounded-md border border-input bg-background px-2 text-sm"
      >
        <option value={ALL_BUSINESS_UNITS}>{c.all}</option>
        {operable.map((unit) => (
          <option key={unit.id} value={unit.id}>
            {unit.name}
          </option>
        ))}
      </select>
      <Button type="submit" variant="ghost" size="sm" className="sr-only focus:not-sr-only">
        {c.apply}
      </Button>
    </form>
  );
}
