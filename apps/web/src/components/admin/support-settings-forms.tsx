'use client';

import { adminSettingsCopy, formatPhone, SUPPORT_HOURS_MAX_LENGTH } from '@transport/shared';
import { useActionState, useId } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Notice } from '@/components/ui/notice';
import { setSupportHoursAction, setSupportWhatsappAction } from '@/lib/admin/settings-actions';
import type { FormState } from '@/lib/forms';

const c = adminSettingsCopy;

function StateNotice({ state }: { state: FormState }) {
  if (state.error) return <Notice tone="error">{state.error}</Notice>;
  if (state.message) return <Notice tone="success">{state.message}</Notice>;
  return null;
}

/**
 * One setting as a text field with "Guardar" and, when it has a value,
 * "Quitar" (saves none).
 */
function SettingForm({
  name,
  label,
  hint,
  status,
  value,
  action,
  inputProps,
  testId,
}: {
  name: string;
  label: string;
  hint: string;
  status?: string;
  value: string | null;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  inputProps?: React.ComponentProps<typeof Input>;
  testId: string;
}) {
  const id = useId();
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-2" noValidate data-testid={testId}>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-64 flex-1 space-y-1.5">
          <Label htmlFor={`${id}-${name}`} className="block px-1">
            {label}
          </Label>
          <Input
            id={`${id}-${name}`}
            name={name}
            // After a failed save, what the admin typed; else the saved value.
            defaultValue={(state.error ? state.values?.[name] : undefined) ?? value ?? ''}
            aria-describedby={`${id}-hint`}
            {...inputProps}
          />
        </div>
        <Button type="submit" variant="secondary" loading={pending}>
          {c.save}
        </Button>
        {value && (
          <Button type="submit" name="clear" value="on" variant="plain" disabled={pending}>
            {c.clear}
          </Button>
        )}
      </div>
      <p id={`${id}-hint`} className="px-1 text-footnote text-text-dim">
        {hint}
        {status && <span className="block pt-0.5 text-text">{status}</span>}
      </p>
      <StateNotice state={state} />
    </form>
  );
}

/** The support WhatsApp and hours (I2, D41). */
export function SupportSettingsForms({
  whatsapp,
  hours,
}: {
  whatsapp: string | null;
  hours: string | null;
}) {
  return (
    <div className="space-y-6">
      <SettingForm
        name="whatsapp"
        label={c.whatsappLabel}
        hint={c.whatsappHint}
        status={whatsapp ? c.whatsappCurrent(formatPhone(whatsapp)) : c.whatsappNone}
        value={whatsapp ? formatPhone(whatsapp) : null}
        action={setSupportWhatsappAction}
        inputProps={{ type: 'tel', inputMode: 'tel', autoComplete: 'off', maxLength: 24 }}
        testId="support-whatsapp-form"
      />
      <SettingForm
        name="hours"
        label={c.hoursLabel}
        hint={c.hoursHint}
        value={hours}
        action={setSupportHoursAction}
        inputProps={{ maxLength: SUPPORT_HOURS_MAX_LENGTH }}
        testId="support-hours-form"
      />
    </div>
  );
}
