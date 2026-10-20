'use client';

import { carrierWebCopy, fleetCopy } from '@transport/shared';
import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { Disclosure } from '@/components/ui/disclosure';
import { Notice } from '@/components/ui/notice';
import { archiveCarrierOperator, archiveCarrierVehicle } from '@/lib/carrier/fleet-actions';

const c = carrierWebCopy.fleet.archive;

/**
 * Archives a unit or an operator (the Gerente, G1a; the trigger refuses it
 * with a trip in progress, B06). Folded until opened and confirmed, so a
 * stray click never archives anything.
 */
export function FleetArchiveForm({ kind, id }: { kind: 'vehicle' | 'operator'; id: string }) {
  const [state, action, pending] = useActionState(
    kind === 'vehicle' ? archiveCarrierVehicle : archiveCarrierOperator,
    {},
  );
  const copy = kind === 'vehicle' ? fleetCopy.units : fleetCopy.operators;
  return (
    <Disclosure
      summary={kind === 'vehicle' ? c.unit : c.operator}
      look="cell"
      tone="red"
      open={Boolean(state.error)}
    >
      <form action={action} className="space-y-3">
        <div className="space-y-0.5">
          <p className="text-headline text-text">{copy.archiveConfirmTitle}</p>
          <p className="text-subhead text-text-dim">{copy.archiveConfirmBody}</p>
        </div>
        {state.error && <Notice tone="error">{state.error}</Notice>}
        <input type="hidden" name={kind === 'vehicle' ? 'vehicleId' : 'operatorId'} value={id} />
        <Button type="submit" variant="destructive" size="sm" loading={pending}>
          {pending ? c.archiving : c.confirm}
        </Button>
      </form>
    </Disclosure>
  );
}
