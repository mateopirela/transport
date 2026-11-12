'use client';

import { carrierWebCopy, fleetCopy } from '@transport/shared';
import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { archiveCarrierOperator, archiveCarrierVehicle } from '@/lib/carrier/fleet-actions';

const c = carrierWebCopy.fleet.archive;

/**
 * Archives a unit or an operator (the Gerente, G1a; the trigger refuses it
 * with a trip in progress, B06). A red button that opens a dialog saying what
 * happens (docs/plan-fulmis.md §1.5), so a stray click never archives anything.
 */
export function FleetArchiveForm({ kind, id }: { kind: 'vehicle' | 'operator'; id: string }) {
  const [state, action, pending] = useActionState(
    kind === 'vehicle' ? archiveCarrierVehicle : archiveCarrierOperator,
    {},
  );
  const copy = kind === 'vehicle' ? fleetCopy.units : fleetCopy.operators;
  return (
    <ConfirmDialog
      trigger={
        <Button variant="destructive" className="w-full">
          {kind === 'vehicle' ? c.unit : c.operator}
        </Button>
      }
      title={copy.archiveConfirmTitle}
      description={copy.archiveConfirmBody}
      confirmLabel={c.confirm}
      cancelLabel={c.cancel}
      destructive
      action={action}
      pending={pending}
      error={state.error}
    >
      <input type="hidden" name={kind === 'vehicle' ? 'vehicleId' : 'operatorId'} value={id} />
    </ConfirmDialog>
  );
}
