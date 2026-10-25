'use client';

import {
  formatDateTime,
  smsUrl,
  tripLinkCopy,
  tripLinkMessage,
  whatsappPhone,
  whatsappUrl,
} from '@transport/shared';
import { useActionState, useState } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { ErrorText } from '@/components/ui/field';
import { Group } from '@/components/ui/group';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Notice } from '@/components/ui/notice';
import { createTripOperatorLink, revokeTripOperatorLink } from '@/lib/carrier/trip-link-actions';
import type { ActiveShareLink } from '@/lib/share-links/queries';

const c = tripLinkCopy.send;

/**
 * "Enviar viaje al operador" (H2, D29): after assigning, the coordinator
 * creates the trip link and sends it in two clicks, by WhatsApp to the
 * operator's phone or by SMS, or copies it. The token is shown once (only its
 * hash is stored); a live link can be revoked or replaced by a new one.
 */
export function TripLinkPanel({
  tripId,
  operatorName,
  operatorPhone,
  route,
  active,
}: {
  tripId: string;
  operatorName: string;
  operatorPhone: string | null;
  route: string;
  active: ActiveShareLink | null;
}) {
  const [state, action, pending] = useActionState(createTripOperatorLink, {});
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const url = state.values?.url;
  const message = url ? tripLinkMessage({ operatorName, route, url }) : null;
  const hasPhone = whatsappPhone(operatorPhone) !== null;

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
    <Group label={c.title} footer={c.description(operatorName)}>
      <div className="space-y-4 px-4 py-4">
        {active && !url && (
          <p className="text-subhead text-text-dim">
            {active.viewCount > 0
              ? c.activeViewed(formatDateTime(active.expiresAt), active.viewCount)
              : c.active(formatDateTime(active.expiresAt))}
          </p>
        )}

        {url && message && active ? (
          <div className="space-y-3">
            <Notice tone="success">{state.message}</Notice>
            {!hasPhone && <p className="text-subhead text-text-dim">{c.noPhone}</p>}
            <div className="flex flex-wrap gap-2">
              <a
                href={whatsappUrl(operatorPhone, message)}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: 'primary' })}
              >
                {c.whatsapp}
              </a>
              <a
                href={smsUrl(operatorPhone, message)}
                className={buttonVariants({ variant: 'secondary' })}
              >
                {c.sms}
              </a>
              <Button type="button" variant="secondary" onClick={() => void copy()}>
                {copiedUrl === url ? c.copied : c.copy}
              </Button>
            </div>
            <Label htmlFor="trip-link-url" className="sr-only">
              {c.link}
            </Label>
            <Input
              id="trip-link-url"
              readOnly
              value={url}
              onFocus={(event) => event.currentTarget.select()}
              className="font-mono text-footnote"
            />
          </div>
        ) : (
          <form action={action} className="space-y-2">
            <input type="hidden" name="tripId" value={tripId} />
            {state.error && <Notice tone="error">{state.error}</Notice>}
            <Button
              type="submit"
              variant={active ? 'secondary' : 'primary'}
              disabled={pending}
              loading={pending}
            >
              {pending ? c.creating : active ? c.renew : c.create}
            </Button>
            {active && <p className="text-footnote text-text-dim">{c.renewHelp}</p>}
          </form>
        )}

        {active && <RevokeTripLink linkId={active.id} />}
      </div>
    </Group>
  );
}

function RevokeTripLink({ linkId }: { linkId: string }) {
  const [state, action, pending] = useActionState(revokeTripOperatorLink, {});
  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="linkId" value={linkId} />
      <Button type="submit" variant="destructive" size="sm" disabled={pending} loading={pending}>
        {pending ? c.revoking : c.revoke}
      </Button>
      {state.error && <ErrorText>{state.error}</ErrorText>}
    </form>
  );
}
