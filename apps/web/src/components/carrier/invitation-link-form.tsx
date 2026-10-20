'use client';

import { formatDateTime, managerCompanyCopy } from '@transport/shared';
import { useActionState, useId, useState } from 'react';

import { checkboxChip } from '@/components/carrier/checkbox-list';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { Select } from '@/components/ui/select';
import type { BusinessUnitOption } from '@/lib/carrier/business-units';
import { issueInvitationAction, type InvitationLinkState } from '@/lib/carrier/company-actions';

const c = managerCompanyCopy.invitationLink;

/**
 * Issues a single-use invitation link (G4) and shows it once, with "Copiar"
 * and, where the browser has it, the system share sheet. `coordinator`
 * chooses one or more business units; a new `operator`, one; an operator row
 * (`operatorId`) or an `operator_access_reset` uses the operator's own.
 * `primary` when issuing the link is what the screen is for ("Invitar
 * operador"); elsewhere its button is secondary.
 */
export function InvitationLinkForm({
  kind,
  label,
  units = [],
  operatorId,
  withName = false,
  companyName,
  primary = false,
}: {
  kind: 'coordinator' | 'operator' | 'operator_access_reset';
  label: string;
  /** Business units to choose from (none when the link names an operator row). */
  units?: readonly BusinessUnitOption[];
  operatorId?: string;
  withName?: boolean;
  /** For the text shared with the link. */
  companyName: string;
  primary?: boolean;
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
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="kind" value={kind} />
      {operatorId && <input type="hidden" name="operatorId" value={operatorId} />}
      {!operatorId && kind === 'coordinator' && (
        <fieldset>
          <legend className="mb-1.5 px-1 text-label text-text-dim">
            {managerCompanyCopy.coordinators.inviteUnitsLabel}
          </legend>
          <div className="flex flex-wrap gap-2">
            {units.map((unit) => (
              <label key={unit.id} className={checkboxChip}>
                <input
                  type="checkbox"
                  name="unitIds"
                  value={unit.id}
                  className="size-4 accent-accent"
                />
                {unit.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {!operatorId && kind === 'operator' && (
        <Field label={managerCompanyCopy.operators.unitLabel} htmlFor={`${id}-unit`}>
          <Select
            id={`${id}-unit`}
            name="unitIds"
            defaultValue={units.length === 1 ? units[0]?.id : ''}
          >
            {units.length !== 1 && <option value="" disabled />}
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {withName && (
        <Field
          label={
            kind === 'coordinator'
              ? managerCompanyCopy.coordinators.inviteeLabel
              : managerCompanyCopy.operators.inviteeLabel
          }
          htmlFor={`${id}-name`}
        >
          <Input id={`${id}-name`} name="inviteeName" autoComplete="off" maxLength={200} />
        </Field>
      )}
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.link && state.expiresAt && (
        <div className="space-y-3 rounded-2xl bg-surface-high px-4 py-4">
          <Field
            label={c.link}
            htmlFor={`${id}-link`}
            hint={`${c.validUntil(formatDateTime(state.expiresAt))}. ${
              kind === 'operator_access_reset' || operatorId ? c.onlyOnceReplaces : c.onlyOnce
            }`}
          >
            <Input
              id={`${id}-link`}
              readOnly
              value={state.link}
              data-testid="invitation-link"
              onFocus={(event) => event.currentTarget.select()}
              className="tabular-nums"
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void copy(state.link ?? '')}
            >
              {c.copy}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void share(state.link ?? '')}
            >
              {c.share}
            </Button>
            {copied && (
              <span className="px-1 text-footnote text-ok-text" role="status">
                {c.copied}
              </span>
            )}
          </div>
        </div>
      )}
      <Button
        type="submit"
        variant={primary && !state.link ? 'primary' : 'secondary'}
        size={primary ? 'default' : 'sm'}
        loading={pending}
      >
        {pending ? c.generating : state.link ? c.generate : label}
      </Button>
    </form>
  );
}
