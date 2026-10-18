'use client';

import { adminCopy, onboardingCopy } from '@transport/shared';
import { useActionState, useId } from 'react';

import { ActionForm, CompanyFiscalFields, Field, Notice } from '@/components/auth-forms';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { FormState } from '@/lib/forms';
import {
  requestCompanyReview,
  reviewCompany,
  reviewDocument,
  updateCompanyContact,
} from '@/lib/verification/actions';

/** Shipper or Gerente: company name, fiscal data (G2) and contact, editable while in review. */
export function CompanyContactForm({ values }: { values: Record<string, string> }) {
  const c = onboardingCopy.company;
  return (
    <ActionForm
      action={updateCompanyContact}
      initial={{ values }}
      submit={c.submit}
      pending={c.pending}
    >
      {(state) => (
        <>
          <CompanyFiscalFields state={state} withRfc={false} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="contactName" label={c.contactName} autoComplete="name" state={state} />
            <Field
              name="contactPhone"
              type="tel"
              label={c.contactPhone}
              autoComplete="tel"
              state={state}
            />
            <Field
              name="contactEmail"
              type="email"
              label={c.contactEmail}
              autoComplete="email"
              state={state}
              className="sm:col-span-2"
            />
          </div>
        </>
      )}
    </ActionForm>
  );
}

/** Shipper: asks for another review of a rejected company. */
export function RequestReviewForm() {
  const c = onboardingCopy.requestReview;
  const [state, action, pending] = useActionState(requestCompanyReview, {});
  return (
    <form action={action} className="space-y-3">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <Button type="submit" variant="accent" disabled={pending}>
        {pending ? c.pending : c.submit}
      </Button>
    </form>
  );
}

function Notes({ state, label, id }: { state: FormState; label: string; id: string }) {
  const error = state.fieldErrors?.notes;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        name="notes"
        rows={2}
        maxLength={2000}
        defaultValue={state.values?.notes}
        aria-invalid={error ? true : undefined}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 aria-invalid:border-destructive"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function FormFeedback({ state }: { state: FormState }) {
  const error = state.error ?? state.fieldErrors?.documentId ?? state.fieldErrors?.companyId;
  return (
    <>
      {error && <Notice tone="error">{error}</Notice>}
      {state.message && <Notice tone="success">{state.message}</Notice>}
    </>
  );
}

/** Admin: approve (with optional expiry date) or reject (with reason) a document. */
export function DocumentReviewForm({
  documentId,
  requiresExpiry,
  expiresOn,
}: {
  documentId: string;
  requiresExpiry: boolean;
  expiresOn?: string;
}) {
  const c = adminCopy.document;
  const id = useId();
  const [state, action, pending] = useActionState(reviewDocument, {});
  const expiryError = state.fieldErrors?.expiresOn;
  return (
    <form action={action} className="space-y-3 rounded-md bg-muted/50 p-3" noValidate>
      <FormFeedback state={state} />
      <input type="hidden" name="documentId" value={documentId} />
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <Notes state={state} label={c.notes} id={`${id}-notes`} />
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-expires`}>{c.expiresOn}</Label>
          <input
            id={`${id}-expires`}
            name="expiresOn"
            type="date"
            defaultValue={state.values?.expiresOn ?? expiresOn}
            required={requiresExpiry}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          />
          <p className={expiryError ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
            {expiryError ?? c.expiresOnHint}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="approve" size="sm" disabled={pending}>
          {c.approve}
        </Button>
        <Button
          type="submit"
          name="decision"
          value="reject"
          size="sm"
          variant="outline"
          disabled={pending}
        >
          {c.reject}
        </Button>
      </div>
    </form>
  );
}

/** Admin: decisions available for the company's current status. */
export function CompanyReviewForm({
  companyId,
  decisions,
}: {
  companyId: string;
  decisions: readonly ('approve' | 'reactivate' | 'reject' | 'suspend')[];
}) {
  const c = adminCopy.companyActions;
  const id = useId();
  const [state, action, pending] = useActionState(reviewCompany, {});
  const needsReason = decisions.some((d) => d === 'reject' || d === 'suspend');
  return (
    <form action={action} className="space-y-3" noValidate>
      <FormFeedback state={state} />
      <input type="hidden" name="companyId" value={companyId} />
      {needsReason && <Notes state={state} label={c.notes} id={`${id}-notes`} />}
      <div className="flex flex-wrap gap-2">
        {decisions.map((decision) => (
          <Button
            key={decision}
            type="submit"
            name="decision"
            // Reactivating a suspended company is an approval (review_company).
            value={decision === 'reactivate' ? 'approve' : decision}
            size="sm"
            variant={decision === 'approve' || decision === 'reactivate' ? 'accent' : 'outline'}
            disabled={pending}
          >
            {c[decision]}
          </Button>
        ))}
      </div>
    </form>
  );
}
