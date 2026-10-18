'use client';

import { carrierWebCopy, fleetCopy } from '@transport/shared';
import { useActionState } from 'react';

import { Notice } from '@/components/auth-forms';
import { Button } from '@/components/ui/button';
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
    <details className="rounded-lg border p-4 open:bg-muted/40" open={Boolean(state.error)}>
      <summary className="cursor-pointer text-sm font-medium text-destructive">
        {kind === 'vehicle' ? c.unit : c.operator}
      </summary>
      <form action={action} className="mt-3 space-y-3">
        <p className="font-medium">{copy.archiveConfirmTitle}</p>
        <p className="text-sm text-muted-foreground">{copy.archiveConfirmBody}</p>
        {state.error && <Notice tone="error">{state.error}</Notice>}
        <input type="hidden" name={kind === 'vehicle' ? 'vehicleId' : 'operatorId'} value={id} />
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? c.archiving : c.confirm}
        </Button>
      </form>
    </details>
  );
}
