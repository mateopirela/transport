'use client';

import {
  authErrors,
  FREIGHT_INVOICE_FUNCTIONS,
  freightInvoiceUploadErrors,
  freightInvoicesCopy,
  type FreightInvoiceDirection,
} from '@transport/shared';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Disclosure } from '@/components/ui/disclosure';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { createBrowserSupabase } from '@/lib/supabase/browser';

const fileInput =
  'py-2.5 file:mr-3 file:border-0 file:bg-transparent file:font-semibold file:text-accent-text';

interface Texts {
  summary: string;
  help?: string;
  xml: string;
  pdf: string;
  submit: string;
  submitting: string;
  done: string;
  doneUnvalidated: string;
}

const TEXTS: Record<FreightInvoiceDirection, Texts> = {
  carrier_to_fulmis: {
    summary: freightInvoicesCopy.carrier.upload,
    help: freightInvoicesCopy.carrier.rules,
    xml: freightInvoicesCopy.carrier.xml,
    pdf: freightInvoicesCopy.carrier.pdf,
    submit: freightInvoicesCopy.carrier.submit,
    submitting: freightInvoicesCopy.carrier.submitting,
    done: freightInvoicesCopy.carrier.done,
    doneUnvalidated: freightInvoicesCopy.carrier.doneUnvalidated,
  },
  fulmis_to_client: {
    summary: freightInvoicesCopy.admin.upload,
    help: freightInvoicesCopy.admin.manualHelp,
    xml: freightInvoicesCopy.admin.xml,
    pdf: freightInvoicesCopy.admin.pdf,
    submit: freightInvoicesCopy.admin.submit,
    submitting: freightInvoicesCopy.admin.submitting,
    done: freightInvoicesCopy.admin.done,
    doneUnvalidated: freightInvoicesCopy.admin.doneUnvalidated,
  },
};

/** The status and JSON body of a failed Edge Function call (supabase-js FunctionsHttpError). */
async function failureOf(error: unknown): Promise<{ status: number | null; body: unknown }> {
  const context = (error as { context?: unknown }).context;
  if (!(context instanceof Response)) return { status: null, body: null };
  return { status: context.status, body: await context.json().catch(() => null) };
}

/**
 * Uploads a trip's CFDI (I5): the XML and the PDF go straight from the
 * browser to the Edge Function of the direction (validate-carrier-cfdi or
 * issue-client-cfdi), with the user's session. The function validates the XML
 * and says every rule that failed; on success the page refreshes, so the
 * list shows the invoice.
 */
export function InvoiceUpload({
  tripId,
  direction,
  compact = false,
}: {
  tripId: string;
  direction: FreightInvoiceDirection;
  /** One field per line, for a table cell. */
  compact?: boolean;
}) {
  const id = useId();
  const router = useRouter();
  const t = TEXTS[direction];
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);

  async function upload(form: HTMLFormElement) {
    const data = new FormData(form);
    const xml = data.get('xml');
    const pdf = data.get('pdf');
    const body = new FormData();
    body.set('tripId', tripId);
    if (xml instanceof File && xml.size > 0) body.set('xml', xml);
    if (pdf instanceof File && pdf.size > 0) body.set('pdf', pdf);
    const supabase = createBrowserSupabase();
    if (!supabase) return setErrors([authErrors.notConfigured]);

    const { data: result, error } = await supabase.functions.invoke<{ validation?: string }>(
      FREIGHT_INVOICE_FUNCTIONS[direction],
      { body },
    );
    if (error) {
      const { status, body: answer } = await failureOf(error);
      return setErrors(freightInvoiceUploadErrors(status, answer));
    }
    setDone(result?.validation === 'validated' ? t.done : t.doneUnvalidated);
    form.reset();
    router.refresh();
  }

  return (
    <Disclosure
      summary={t.summary}
      look="inline"
      tone="accent"
      open={errors.length > 0 || done !== null}
    >
      <form
        className="mt-2 space-y-3"
        noValidate
        data-testid={`invoice-upload-${direction}`}
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          setErrors([]);
          setDone(null);
          setPending(true);
          upload(form)
            .catch(() => setErrors([freightInvoicesCopy.errors.generic]))
            .finally(() => setPending(false));
        }}
      >
        {t.help && <p className="px-1 text-footnote text-text-dim">{t.help}</p>}
        {errors.length > 0 && (
          <Notice tone="error">
            <ul className="space-y-0.5">
              {errors.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Notice>
        )}
        {done && <Notice tone="success">{done}</Notice>}
        <div className={compact ? 'grid gap-3' : 'grid gap-3 sm:grid-cols-2'}>
          <Field label={t.xml} htmlFor={`${id}-xml`}>
            <Input
              id={`${id}-xml`}
              name="xml"
              type="file"
              accept=".xml,application/xml,text/xml"
              className={fileInput}
            />
          </Field>
          <Field label={t.pdf} htmlFor={`${id}-pdf`}>
            <Input
              id={`${id}-pdf`}
              name="pdf"
              type="file"
              accept=".pdf,application/pdf"
              className={fileInput}
            />
          </Field>
        </div>
        <Button type="submit" variant="secondary" size="sm" disabled={pending} loading={pending}>
          {pending ? t.submitting : t.submit}
        </Button>
      </form>
    </Disclosure>
  );
}
