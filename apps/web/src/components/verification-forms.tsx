'use client';

import { adminCopy, adminPanelCopy, onboardingCopy, type PersonType } from '@transport/shared';
import { useActionState, useId } from 'react';

import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { ActionForm, CompanyFiscalFields, Field, Notice } from '@/components/auth-forms';
import { Button } from '@/components/ui/button';
import { Field as FieldFrame, fieldHelpId } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { FormState } from '@/lib/forms';
import {
  requestCompanyReview,
  reviewCompany,
  reviewDocument,
  updateCompanyContact,
} from '@/lib/verification/actions';

/** Shipper or Gerente: company name, fiscal data (G2) and contact, editable while in review. */
export function CompanyContactForm({
  values,
  personType,
}: {
  values: Record<string, string>;
  /** From the RFC, which cannot change here: a persona física has no representative (D42). */
  personType: PersonType;
}) {
  const c = onboardingCopy.company;
  return (
    <ActionForm
      action={updateCompanyContact}
      initial={{ values }}
      submit={c.submit}
      pending={c.pending}
      // The documents are the main action of the review page: the data form is secondary.
      submitVariant="secondary"
    >
      {(state) => (
        <>
          <CompanyFiscalFields state={state} withRfc={false} personType={personType} />
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
      <Button type="submit" className="w-full" disabled={pending} loading={pending}>
        {pending ? c.pending : c.submit}
      </Button>
    </form>
  );
}

const k = adminPanelCopy.confirm;

/** What each decision on a company says before it runs. */
const COMPANY_CONFIRM = {
  approve: k.approveCompany,
  reactivate: k.reactivateCompany,
  reject: k.rejectCompany,
  suspend: k.suspendCompany,
} as const;

function Notes({ state, label, id }: { state: FormState; label: string; id: string }) {
  const error = state.fieldErrors?.notes;
  return (
    <FieldFrame label={label} htmlFor={id} error={error}>
      <Textarea
        id={id}
        name="notes"
        rows={2}
        maxLength={2000}
        defaultValue={state.values?.notes}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? fieldHelpId(id) : undefined}
      />
    </FieldFrame>
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
    <form action={action} className="space-y-4 border-t pt-4" noValidate>
      <FormFeedback state={state} />
      <input type="hidden" name="documentId" value={documentId} />
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <Notes state={state} label={c.notes} id={`${id}-notes`} />
        <FieldFrame
          label={c.expiresOn}
          htmlFor={`${id}-expires`}
          error={expiryError}
          hint={c.expiresOnHint}
        >
          <Input
            id={`${id}-expires`}
            name="expiresOn"
            type="date"
            defaultValue={state.values?.expiresOn ?? expiresOn}
            required={requiresExpiry}
            aria-invalid={expiryError ? true : undefined}
            aria-describedby={fieldHelpId(`${id}-expires`)}
          />
        </FieldFrame>
      </div>
      <div className="flex flex-wrap gap-2">
        <ConfirmSubmit
          name="decision"
          value="approve"
          size="sm"
          disabled={pending}
          title={k.approveDocument.title}
          description={k.approveDocument.body}
          confirmLabel={k.approveDocument.confirm}
        >
          {c.approve}
        </ConfirmSubmit>
        <ConfirmSubmit
          name="decision"
          value="reject"
          size="sm"
          variant="destructive"
          destructive
          disabled={pending}
          title={k.rejectDocument.title}
          description={k.rejectDocument.body}
          confirmLabel={k.rejectDocument.confirm}
        >
          {c.reject}
        </ConfirmSubmit>
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
      <div className="flex flex-col gap-2 [&>button]:w-full">
        {decisions.map((decision) => {
          const confirm = COMPANY_CONFIRM[decision];
          const approves = decision === 'approve' || decision === 'reactivate';
          return (
            <ConfirmSubmit
              key={decision}
              name="decision"
              // Reactivating a suspended company is an approval (review_company).
              value={approves ? 'approve' : decision}
              variant={approves ? 'primary' : 'destructive'}
              destructive={!approves}
              disabled={pending}
              title={confirm.title}
              description={confirm.body}
              confirmLabel={confirm.confirm}
            >
              {c[decision]}
            </ConfirmSubmit>
          );
        })}
      </div>
    </form>
  );
}
