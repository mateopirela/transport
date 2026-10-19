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

import { PageHeading } from '@/components/app-shell';
import { Notice } from '@/components/auth-forms';
import { LoadStatusBadge } from '@/components/loads/load-status-badge';
import { buttonVariants } from '@/components/ui/button';
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
  const back = (
    <Link href={paths.carrierLoads} className="text-sm text-accent hover:underline">
      {carrierWebCopy.detail.back}
    </Link>
  );
  if (!load) {
    return (
      <>
        {back}
        <div className="mt-4">
          <PageHeading title={c.unavailableTitle} description={c.unavailableBody} />
        </div>
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
  const details = rows.filter((row): row is [string, string] => row[1] !== null);

  return (
    <>
      {back}
      <p className="mt-4 text-sm text-muted-foreground">{c.description}</p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <PageHeading
          title={`${load.origin.city} → ${load.destination.city}`}
          description={`${load.origin.city}, ${load.origin.state} → ${load.destination.city}, ${load.destination.state}`}
        />
        <LoadStatusBadge status={load.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section className="space-y-3">
          <h2 className="text-2xl">{c.details}</h2>
          <dl className="grid gap-x-6 gap-y-4 rounded-xl border bg-card p-6 sm:grid-cols-2">
            {details.map(([label, value]) => (
              <div key={label} className="space-y-1">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-sm">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <aside className="space-y-3">
          {load.canOffer ? (
            <Link
              href={carrierLoadPath(load.loadId)}
              className={buttonVariants({ variant: 'accent' })}
            >
              {c.openLoad}
            </Link>
          ) : (
            <Notice tone="info">{c.readOnly}</Notice>
          )}
        </aside>
      </div>
    </>
  );
}
