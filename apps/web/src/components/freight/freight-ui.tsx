import {
  formatCalendarDate,
  formatInvoiceIssuedDate,
  formatMxn,
  freightCarrierStatusLabels,
  freightClientStatusLabels,
  freightInvoicesCopy,
  freightInvoiceValidationLabels,
  shortCfdiUuid,
  type FreightCarrierStatus,
  type FreightClientStatus,
} from '@transport/shared';
import type { ReactNode } from 'react';

import { textLink } from '@/components/page-section';
import { Pill } from '@/components/ui/pill';
import type { FreightInvoice } from '@/lib/freight/invoices';
import { invoiceFileHref, type InvoiceArea } from '@/lib/freight/invoice-links';
import { freightCarrierTone, freightClientTone } from '@/lib/status-tones';
import { cn } from '@/lib/utils';

/** The totals of Cobranza or Cartera: up to three tiles, the amount large. */
export function FreightTotals({
  items,
  className,
}: {
  items: readonly { label: string; cents: number; testId: string; tone?: 'red' | 'amber' }[];
  className?: string;
}) {
  return (
    <dl className={cn('mb-8 grid gap-3 sm:grid-cols-3', className)}>
      {items.map((item) => (
        <div key={item.testId} className="rounded-2xl border bg-cell px-4 py-3.5">
          <dt className="text-subhead text-text-dim">{item.label}</dt>
          <dd
            data-testid={item.testId}
            className={cn(
              'mt-1 text-title2 text-text tabular-nums',
              item.cents > 0 && item.tone === 'red' && 'text-red-text',
              item.cents > 0 && item.tone === 'amber' && 'text-amber-text',
            )}
          >
            {formatMxn(item.cents)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ClientStatusPill({ status }: { status: FreightClientStatus }) {
  return <Pill tone={freightClientTone(status)}>{freightClientStatusLabels[status]}</Pill>;
}

export function CarrierStatusPill({ status }: { status: FreightCarrierStatus }) {
  return <Pill tone={freightCarrierTone(status)}>{freightCarrierStatusLabels[status]}</Pill>;
}

/** A calendar date ("10 dic 2026"), or the fallback when there is none. */
export function dueLabel(date: string | null, fallback: string): string {
  return date ? formatCalendarDate(date) : fallback;
}

/**
 * A registered CFDI (I5): its folio fiscal (short), its date, whether it was
 * fully validated and the links to its PDF and XML (signed by the area's
 * download route).
 */
export function InvoiceSummary({
  invoice,
  area,
  showValidation = true,
  fallback = null,
}: {
  invoice: FreightInvoice | undefined;
  area: InvoiceArea;
  showValidation?: boolean;
  /** What shows while there is no invoice. */
  fallback?: ReactNode;
}) {
  const f = freightInvoicesCopy;
  if (!invoice) return fallback;
  return (
    <div className="space-y-1" data-testid={`invoice-${invoice.direction}`}>
      <p className="text-footnote text-text-dim tabular-nums">
        {f.invoiceLine(shortCfdiUuid(invoice.cfdiUuid), formatInvoiceIssuedDate(invoice.issuedAt))}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-subhead">
        {showValidation && (
          <Pill tone={invoice.validation === 'validated' ? 'done' : 'pending'}>
            {freightInvoiceValidationLabels[invoice.validation]}
          </Pill>
        )}
        {invoice.hasPdf && (
          <a
            href={invoiceFileHref(area, invoice.id, 'pdf')}
            className={textLink}
            aria-label={f.download(f.downloadPdf)}
          >
            {f.downloadPdf}
          </a>
        )}
        <a
          href={invoiceFileHref(area, invoice.id, 'xml')}
          className={textLink}
          aria-label={f.download(f.downloadXml)}
        >
          {f.downloadXml}
        </a>
      </div>
    </div>
  );
}
