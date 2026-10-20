'use client';

import {
  DEFAULT_SHARE_VALIDITY_HOURS,
  formatDateTime,
  SHARE_VALIDITY_HOURS,
  shareLinksCopy,
  type ShareLinkKind,
} from '@transport/shared';
import { useActionState, useState } from 'react';

import { Notice } from '@/components/auth-forms';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { ErrorText, Field, fieldHelpId } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { groupRow } from '@/components/ui/variants';
import { createShareLink, revokeShareLink } from '@/lib/share-links/actions';
import type { ActiveShareLink } from '@/lib/share-links/queries';
import { cn } from '@/lib/utils';

const c = shareLinksCopy.dialog;

/**
 * "Compartir" (G7, D23): the shipper creates a public read-only link to a
 * load or to the tracking of a trip, with a validity, copies it, and sees
 * and revokes the active links. The token is shown once: it is not stored.
 * Once the target can no longer be shared (`canCreate` false) the dialog
 * still lists the active links so they can be revoked.
 */
export function ShareDialog({
  kind,
  targetId,
  links,
  canCreate,
}: {
  kind: Extract<ShareLinkKind, 'load_public' | 'trip_tracking_public'>;
  targetId: string;
  links: ActiveShareLink[];
  canCreate: boolean;
}) {
  const [state, action, pending] = useActionState(createShareLink, {});
  // The URL that was copied: a new link shows "Copiar enlace" again.
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const target = kind === 'load_public' ? 'load' : 'trip';
  const url = state.values?.url;
  const copied = url !== undefined && copiedUrl === url;
  const hoursError = state.fieldErrors?.hours;

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
    } catch {
      // Clipboard refused (insecure context): the link stays selectable below.
      setCopiedUrl(null);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary">
          {shareLinksCopy.button}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={c.title[target]}
        description={c.description[target]}
        className="max-w-lg space-y-5"
      >
        {target === 'trip' && <p className="text-subhead text-text-dim">{c.trackingEnds}</p>}

        {!canCreate && <Notice tone="info">{c.cannotCreate[target]}</Notice>}
        {canCreate && (
          <form action={action} className="space-y-3" noValidate>
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="targetId" value={targetId} />
            {state.error && <Notice tone="error">{state.error}</Notice>}
            <div className="flex flex-wrap items-end gap-3">
              <Field
                label={c.validity}
                htmlFor="share-hours"
                error={hoursError}
                className="min-w-40 flex-1"
              >
                <Select
                  id="share-hours"
                  name="hours"
                  defaultValue={DEFAULT_SHARE_VALIDITY_HOURS[kind]}
                  aria-invalid={hoursError ? true : undefined}
                  aria-describedby={hoursError ? fieldHelpId('share-hours') : undefined}
                >
                  {SHARE_VALIDITY_HOURS.map((hours) => (
                    <option key={hours} value={hours}>
                      {c.validityOptions[hours]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button type="submit" disabled={pending} loading={pending}>
                {pending ? c.creating : c.create}
              </Button>
            </div>
          </form>
        )}

        {url && (
          <div className="space-y-3">
            <Notice tone="success">{state.message}</Notice>
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="share-url" className="sr-only">
                {c.link}
              </Label>
              <Input
                id="share-url"
                readOnly
                value={url}
                onFocus={(event) => event.currentTarget.select()}
                className="min-w-0 flex-1 font-mono text-footnote"
              />
              <Button type="button" variant="secondary" size="sm" onClick={() => void copy()}>
                {copied ? c.copied : c.copy}
              </Button>
            </div>
            {state.values?.expiresAt && (
              <p className="px-1 text-footnote text-text-dim">
                {c.expiresAt(formatDateTime(state.values.expiresAt))}
              </p>
            )}
          </div>
        )}

        <section>
          <h3 className="mb-1.5 px-4 text-label text-text-dim">{c.activeLinks}</h3>
          {links.length === 0 ? (
            <p className="rounded-2xl bg-surface-high px-4 py-3 text-subhead text-text-dim">
              {c.noActiveLinks}
            </p>
          ) : (
            <ul className="overflow-hidden rounded-2xl border">
              {links.map((link) => (
                <li
                  key={link.id}
                  className={cn(groupRow, 'flex flex-wrap items-center gap-3 px-4 py-3')}
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-subhead text-text">
                      {c.createdAt(formatDateTime(link.createdAt))}
                    </p>
                    <p className="text-footnote text-text-dim">
                      {c.expiresAt(formatDateTime(link.expiresAt))} ·{' '}
                      {link.lastViewedAt
                        ? `${c.views(link.viewCount)} · ${c.lastViewed(formatDateTime(link.lastViewedAt))}`
                        : c.neverViewed}
                    </p>
                  </div>
                  <RevokeButton linkId={link.id} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}

function RevokeButton({ linkId }: { linkId: string }) {
  const [state, action, pending] = useActionState(revokeShareLink, {});
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="linkId" value={linkId} />
      <Button type="submit" variant="destructive" size="sm" disabled={pending} loading={pending}>
        {pending ? c.revoking : c.revoke}
      </Button>
      {state.error && <ErrorText>{state.error}</ErrorText>}
    </form>
  );
}
