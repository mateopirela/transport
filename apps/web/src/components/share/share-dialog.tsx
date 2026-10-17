'use client';

import {
  DEFAULT_SHARE_VALIDITY_HOURS,
  formatDateTime,
  SHARE_VALIDITY_HOURS,
  shareLinksCopy,
  type ShareLinkKind,
} from '@transport/shared';
import { useActionState, useRef, useState } from 'react';

import { Notice } from '@/components/auth-forms';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { createShareLink, revokeShareLink } from '@/lib/share-links/actions';
import type { ActiveShareLink } from '@/lib/share-links/queries';

const c = shareLinksCopy.dialog;

/**
 * "Compartir" (G7, D23): the shipper creates a public read-only link to a
 * load or to the tracking of a trip, with a validity, copies it, and sees
 * and revokes the active links. The token is shown once: it is not stored.
 */
export function ShareDialog({
  kind,
  targetId,
  links,
}: {
  kind: Extract<ShareLinkKind, 'load_public' | 'trip_tracking_public'>;
  targetId: string;
  links: ActiveShareLink[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState(createShareLink, {});
  // The URL that was copied: a new link shows "Copiar enlace" again.
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const target = kind === 'load_public' ? 'load' : 'trip';
  const url = state.values?.url;
  const copied = url !== undefined && copiedUrl === url;

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
    <>
      <Button type="button" variant="outline" onClick={() => dialog.current?.showModal()}>
        {shareLinksCopy.button}
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby="share-dialog-title"
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border bg-card p-0 text-foreground shadow-lg backdrop:bg-navy/40"
      >
        <div className="space-y-5 p-6">
          <div className="space-y-1">
            <h2 id="share-dialog-title" className="text-2xl">
              {c.title[target]}
            </h2>
            <p className="text-sm text-muted-foreground">{c.description[target]}</p>
            {target === 'trip' && <p className="text-sm text-muted-foreground">{c.trackingEnds}</p>}
          </div>

          <form action={action} className="space-y-3" noValidate>
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="targetId" value={targetId} />
            {state.error && <Notice tone="error">{state.error}</Notice>}
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="share-hours">{c.validity}</Label>
                <select
                  id="share-hours"
                  name="hours"
                  defaultValue={DEFAULT_SHARE_VALIDITY_HOURS[kind]}
                  aria-invalid={state.fieldErrors?.hours ? true : undefined}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {SHARE_VALIDITY_HOURS.map((hours) => (
                    <option key={hours} value={hours}>
                      {c.validityOptions[hours]}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" variant="accent" disabled={pending}>
                {pending ? c.creating : c.create}
              </Button>
            </div>
            {state.fieldErrors?.hours && (
              <p className="text-xs text-destructive">{state.fieldErrors.hours}</p>
            )}
          </form>

          {url && (
            <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
              <Notice tone="success">{state.message}</Notice>
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="share-url" className="sr-only">
                  {c.link}
                </Label>
                <input
                  id="share-url"
                  readOnly
                  value={url}
                  onFocus={(event) => event.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
                  {copied ? c.copied : c.copy}
                </Button>
              </div>
              {state.values?.expiresAt && (
                <p className="text-xs text-muted-foreground">
                  {c.expiresAt(formatDateTime(state.values.expiresAt))}
                </p>
              )}
            </div>
          )}

          <section className="space-y-2">
            <h3 className="text-sm font-medium">{c.activeLinks}</h3>
            {links.length === 0 ? (
              <p className="text-sm text-muted-foreground">{c.noActiveLinks}</p>
            ) : (
              <ul className="divide-y rounded-lg border text-sm">
                {links.map((link) => (
                  <li key={link.id} className="flex flex-wrap items-center gap-3 p-3">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p>{c.createdAt(formatDateTime(link.createdAt))}</p>
                      <p className="text-xs text-muted-foreground">
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

          <form method="dialog" className="flex justify-end">
            <Button type="submit" variant="ghost">
              {c.close}
            </Button>
          </form>
        </div>
      </dialog>
    </>
  );
}

function RevokeButton({ linkId }: { linkId: string }) {
  const [state, action, pending] = useActionState(revokeShareLink, {});
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="linkId" value={linkId} />
      <Button
        type="submit"
        variant="outline"
        size="sm"
        className="border-destructive/40 text-destructive"
        disabled={pending}
      >
        {pending ? c.revoking : c.revoke}
      </Button>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </form>
  );
}
