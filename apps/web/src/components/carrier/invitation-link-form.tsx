'use client';

import { formatDateTime, managerCompanyCopy } from '@transport/shared';
import { useActionState, useId, useState } from 'react';

import { Notice } from '@/components/auth-forms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { BusinessUnitOption } from '@/lib/carrier/business-units';
import { issueInvitationAction, type InvitationLinkState } from '@/lib/carrier/company-actions';

const c = managerCompanyCopy.invitationLink;
const select = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

/**
 * Issues a single-use invitation link (G4) and shows it once, with "Copiar"
 * and, where the browser has it, the system share sheet. `coordinator`
 * chooses one or more business units; a new `operator`, one; an operator row
 * (`operatorId`) or an `operator_access_reset` uses the operator's own.
 */
export function InvitationLinkForm({
  kind,
  label,
  units = [],
  operatorId,
  withName = false,
  companyName,
}: {
  kind: 'coordinator' | 'operator' | 'operator_access_reset';
  label: string;
  /** Business units to choose from (none when the link names an operator row). */
  units?: readonly BusinessUnitOption[];
  operatorId?: string;
  withName?: boolean;
  /** For the text shared with the link. */
  companyName: string;
}) {
  const id = useId();
  const [state, action, pending] = useActionState<InvitationLinkState, FormData>(
    issueInvitationAction,
    {},
  );
  const [copied, setCopied] = useState(false);

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const shareMessage = (link: string) =>
    kind === 'coordinator'
      ? c.coordinatorShareMessage(companyName, link)
      : kind === 'operator'
        ? c.operatorShareMessage(companyName, link)
        : managerCompanyCopy.operators.resetShareMessage(companyName, link);

  // The system share sheet where the browser has one; otherwise, copy.
  async function share(link: string) {
    if (typeof navigator.share !== 'function') return copy(link);
    await navigator.share({ text: shareMessage(link) }).catch(() => undefined);
  }

  return (
    <form action={action} className="space-y-3" noValidate>
      <input type="hidden" name="kind" value={kind} />
      {operatorId && <input type="hidden" name="operatorId" value={operatorId} />}
      {!operatorId && kind === 'coordinator' && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">
            {managerCompanyCopy.coordinators.inviteUnitsLabel}
          </legend>
          {units.map((unit) => (
            <label key={unit.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="unitIds" value={unit.id} />
              {unit.name}
            </label>
          ))}
        </fieldset>
      )}
      {!operatorId && kind === 'operator' && (
        <div className="space-y-2">
          <Label htmlFor={`${id}-unit`}>{managerCompanyCopy.operators.unitLabel}</Label>
          <select
            id={`${id}-unit`}
            name="unitIds"
            defaultValue={units.length === 1 ? units[0]?.id : ''}
            className={select}
          >
            {units.length !== 1 && <option value="" disabled />}
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {withName && (
        <div className="space-y-2">
          <Label htmlFor={`${id}-name`}>
            {kind === 'coordinator'
              ? managerCompanyCopy.coordinators.inviteeLabel
              : managerCompanyCopy.operators.inviteeLabel}
          </Label>
          <Input id={`${id}-name`} name="inviteeName" autoComplete="off" maxLength={200} />
        </div>
      )}
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.link && state.expiresAt && (
        <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
          <Label htmlFor={`${id}-link`}>{c.link}</Label>
          <Input
            id={`${id}-link`}
            readOnly
            value={state.link}
            data-testid="invitation-link"
            onFocus={(event) => event.currentTarget.select()}
          />
          <p className="text-xs text-muted-foreground">
            {c.validUntil(formatDateTime(state.expiresAt))}. {c.onlyOnce}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void copy(state.link ?? '')}
            >
              {c.copy}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void share(state.link ?? '')}
            >
              {c.share}
            </Button>
          </div>
          {copied && <p className="text-xs text-success">{c.copied}</p>}
        </div>
      )}
      <Button
        type="submit"
        variant={state.link ? 'outline' : 'accent'}
        size="sm"
        disabled={pending}
      >
        {pending ? c.generating : state.link ? c.generate : label}
      </Button>
    </form>
  );
}
