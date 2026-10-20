import {
  APP_LOCALE,
  cargoTypeLabels,
  carrierWebCopy,
  formatDateTime,
  formatMxn,
  internalSharedLoadSchema,
  isShareToken,
  loadStatusLabels,
  shareLinksCopy,
  specialRequirementLabels,
  unitTypeLabels,
  type InternalSharedLoad,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Link as LinkIcon } from 'lucide-react';

import { FactList } from '@/components/carrier/fact-list';
import { LoadStatusBadge } from '@/components/loads/load-status-badge';
import { BackLink, PageSection } from '@/components/page-section';
import { buttonVariants } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { carrierContext } from '@/lib/carrier/context';
import { carrierLoadPath, carrierSharedPath, paths } from '@/lib/routing';
import type { Supabase } from '@/lib/viewer';

const c = shareLinksCopy.internal;
const number = new Intl.NumberFormat(APP_LOCALE, { maximumFractionDigits: 2 });

export const metadata: Metadata = {
  title: c.title,
  robots: { index: false, follow: false, noarchive: true },
};

/**
 * The load behind an internal link, or null when it is not available to the
 * viewer: unknown, expired or revoked token, another company's link, or a
 * document that does not match the schema.
 */
async function openInternalShare(
  supabase: Supabase,
  token: string,
): Promise<InternalSharedLoad | null> {
  if (!isShareToken(token)) return null;
  const { data, error } = await supabase.rpc('open_internal_share', { p_token: token });
  if (error) {
    if (error.code === '42501') return null;
    throw new Error(`Internal share query failed: ${error.message}`);
  }
  const parsed = internalSharedLoadSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/**
 * A load shared with the carrier's team (G7, D23): read-only summary for the
 * staff of the company that shared it (the layout already requires an
 * approved carrier's Gerente or Coordinador), with a way into the load screen
 * to offer while the load is still open. Opened from the app's share sheet.
 */
export default async function CarrierSharedPage({
  params,
}: PageProps<'/transportista/compartido/[token]'>) {
  const { token } = await params;
  const { supabase } = await carrierContext(carrierSharedPath(token));
  const load = await openInternalShare(supabase, token);
  const back = <BackLink href={paths.carrierLoads}>{carrierWebCopy.detail.back}</BackLink>;
  if (!load) {
    return (
      <>
        {back}
        <Empty title={c.unavailableTitle} description={c.unavailableBody} icon={LinkIcon} />
      </>
    );
  }

  const window = (w: { start: string; end: string }) =>
    c.window(formatDateTime(w.start), formatDateTime(w.end));
  // Label and value; rows without a value are left out.
  const rows: [string, string | null][] = [
    [c.labels.status, loadStatusLabels[load.status]],
    [c.labels.pickup, window(load.pickupWindow)],
    [c.labels.delivery, window(load.deliveryWindow)],
    [c.labels.cargoType, cargoTypeLabels[load.cargoType]],
    [c.labels.cargo, load.description],
    [c.labels.weight, c.weightValue(number.format(load.weightKg))],
    [c.labels.volume, load.volumeM3 === null ? null : c.volumeValue(number.format(load.volumeM3))],
    [c.labels.unitType, unitTypeLabels[load.unitType]],
    [
      c.labels.requirements,
      load.specialRequirements.length === 0
        ? c.labels.noRequirements
        : load.specialRequirements.map((r) => specialRequirementLabels[r]).join(', '),
    ],
    [c.labels.price, formatMxn(load.proposedPriceCents)],
    [c.labels.notes, load.notes],
  ];

  return (
    <>
      {back}
      <p className="mb-1.5 text-footnote text-text-dim">{c.description}</p>
      <PageHeader
        title={`${load.origin.city} → ${load.destination.city}`}
        status={<LoadStatusBadge status={load.status} />}
        description={`${load.origin.city}, ${load.origin.state} → ${load.destination.city}, ${load.destination.state}`}
        action={
          load.canOffer && (
            <Link
              href={carrierLoadPath(load.loadId)}
              className={buttonVariants({ variant: 'primary' })}
            >
              {c.openLoad}
            </Link>
          )
        }
      />
      {!load.canOffer && (
        <Notice tone="info" className="mb-8">
          {c.readOnly}
        </Notice>
      )}

      <PageSection title={c.details} className="max-w-3xl">
        <FactList rows={rows} />
      </PageSection>
    </>
  );
}
