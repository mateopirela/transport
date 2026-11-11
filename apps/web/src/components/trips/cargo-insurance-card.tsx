import {
  cargoInsuranceCopy as c,
  formatDate,
  formatDateTime,
  type CargoInsuranceState,
} from '@transport/shared';
import Link from 'next/link';

import { Pill, type PillTone } from '@/components/ui/pill';
import { cn } from '@/lib/utils';

import { TripDocumentUpload } from './trip-document-upload';

const tones: Record<CargoInsuranceState['kind'], PillTone> = {
  trip_policy: 'done',
  annual_policy: 'done',
  missing: 'pending',
  not_required: 'inactive',
};

/** The line that says how the trip is (or is not) insured. */
export function cargoInsuranceText(state: CargoInsuranceState): string {
  switch (state.kind) {
    case 'trip_policy':
      return c.state.trip_policy(formatDateTime(state.uploadedAt));
    case 'annual_policy':
      return c.state.annual_policy(formatDate(state.expiresAt));
    case 'missing':
      return c.state.missing;
    case 'not_required':
      return c.state.not_required;
  }
}

/**
 * "Seguro de la mercancía" of a trip (I1, D35-E1). The shipper sees how the
 * trip is covered and, while it may still be uploaded, the upload of the
 * policy of the trip and the way to its annual policy; the carrier staff sees
 * the state only (the policy is the shipper's).
 */
export function CargoInsuranceCard({
  state,
  side,
  tripId,
  canUpload = false,
  companyHref,
  registerAction,
}: {
  state: CargoInsuranceState;
  side: 'shipper' | 'carrier';
  tripId: string;
  /** The shipper, before the trip leaves (add_trip_document checks it again). */
  canUpload?: boolean;
  /** "Documentos de la empresa", for the shipper's annual policy. */
  companyHref?: string;
  registerAction?: (input: unknown) => Promise<{ error?: string }>;
}) {
  const missing = state.kind === 'missing';
  return (
    <section className="space-y-3" aria-labelledby={`cargo-insurance-${tripId}`}>
      <div className="space-y-1 px-1">
        <h2 id={`cargo-insurance-${tripId}`} className="text-title2 text-text">
          {c.title}
        </h2>
        <p className="text-subhead text-text-dim">
          {side === 'shipper' ? c.shipperHelp : c.carrierHelp}
        </p>
      </div>
      <div className="space-y-4 rounded-2xl border bg-cell p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p
            className={cn('text-body', missing ? 'text-amber-text' : 'text-text')}
            role="status"
            data-testid="cargo-insurance-state"
          >
            {cargoInsuranceText(state)}
          </p>
          <Pill tone={tones[state.kind]}>{c.pill[state.kind]}</Pill>
        </div>
        {missing && (
          <p className="text-footnote text-text-dim">
            {state.blocksDeparture ? c.blocks : c.warnsOnly}
          </p>
        )}
        {side === 'shipper' && canUpload && state.kind !== 'trip_policy' && (
          <>
            <TripDocumentUpload
              tripId={tripId}
              kinds={['cargo_insurance']}
              doneText={c.uploaded}
              title={c.upload}
              {...(registerAction ? { registerAction } : {})}
            />
            {companyHref && state.kind !== 'annual_policy' && (
              <p className="text-footnote text-text-dim">
                {c.annualHint}{' '}
                <Link href={companyHref} className="font-semibold text-accent-text hover:underline">
                  {c.annualLink}
                </Link>
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
