import {
  documentShareRevokeReasonLabels,
  formatDateTime,
  groupSharedDocuments,
  sharedDocumentsCopy,
  type SharedDocumentGroup,
  type SharedDocumentRow,
} from '@transport/shared';

import { sharedDocumentHref } from '@/lib/shared-documents/links';
import { cn } from '@/lib/utils';

import { RevokeShareButton } from './revoke-share-button';

const c = sharedDocumentsCopy;

function ownerTitle(group: SharedDocumentGroup): string {
  switch (group.ownerType) {
    case 'company':
      return c.owner.company;
    case 'vehicle':
      return c.owner.vehicle(group.ownerLabel);
    case 'operator':
      return c.owner.operator(group.ownerLabel);
  }
}

function RowDetails({ row }: { row: SharedDocumentRow }) {
  return (
    <div className="space-y-0.5">
      <p className="font-medium">{row.requirement_name}</p>
      <p className="text-xs text-muted-foreground">
        {[
          row.expires_at ? c.expires(formatDateTime(row.expires_at)) : null,
          c.sharedAt(formatDateTime(row.granted_at)),
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </div>
  );
}

/**
 * The documents of the carrier, its unit and its operator shared on a trip
 * (D21). The shipper opens each one through the logged, signed viewer; the
 * carrier staff sees what is shared and why it stopped, and the manager can
 * stop sharing one.
 */
export function SharedDocumentsList({
  rows,
  mode,
  canRevoke = false,
}: {
  rows: readonly SharedDocumentRow[];
  mode: 'client' | 'carrier';
  canRevoke?: boolean;
}) {
  const copy = mode === 'client' ? c.client : c.carrier;
  const groups = groupSharedDocuments(rows);
  return (
    <section className="space-y-3" aria-labelledby={`shared-documents-${mode}`}>
      <h2 id={`shared-documents-${mode}`} className="text-2xl">
        {copy.title}
      </h2>
      <p className="text-sm text-muted-foreground">{copy.description}</p>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{copy.empty}</p>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={`${group.ownerType}:${group.ownerLabel ?? ''}`} className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">{ownerTitle(group)}</h3>
              <ul className="divide-y rounded-xl border bg-card text-sm">
                {group.rows.map((row) => (
                  <li
                    key={row.share_id}
                    className={cn(
                      'flex flex-wrap items-center justify-between gap-3 p-4',
                      !row.active && 'text-muted-foreground',
                    )}
                  >
                    <RowDetails row={row} />
                    {mode === 'client' ? (
                      <a
                        href={sharedDocumentHref(row.share_id)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={c.client.viewLabel(row.requirement_name)}
                        className="font-medium text-accent hover:underline"
                      >
                        {c.client.view}
                      </a>
                    ) : (
                      <div className="flex flex-wrap items-center gap-3">
                        <span className={cn('text-xs', row.active && 'text-success')}>
                          {row.active
                            ? c.carrier.active
                            : c.carrier.revoked(
                                row.revoked_reason
                                  ? documentShareRevokeReasonLabels[row.revoked_reason]
                                  : c.revokeFallback,
                              )}
                        </span>
                        {canRevoke && row.active && <RevokeShareButton shareId={row.share_id} />}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
