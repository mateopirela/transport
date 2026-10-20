import {
  documentShareRevokeReasonLabels,
  formatDateTime,
  groupSharedDocuments,
  sharedDocumentsCopy,
  type SharedDocumentGroup,
  type SharedDocumentRow,
} from '@transport/shared';

import { buttonVariants } from '@/components/ui/button';
import { Group } from '@/components/ui/group';
import { groupRow } from '@/components/ui/variants';
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
    <div className="min-w-0 flex-1 space-y-0.5">
      <p className={cn('text-body', row.active ? 'text-text' : 'text-text-dim')}>
        {row.requirement_name}
      </p>
      <p className="text-footnote text-text-dim">
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
    <section className="space-y-4" aria-labelledby={`shared-documents-${mode}`}>
      <div className="space-y-1 px-1">
        <h2 id={`shared-documents-${mode}`} className="text-title2 text-text">
          {copy.title}
        </h2>
        <p className="text-subhead text-text-dim">{copy.description}</p>
      </div>
      {groups.length === 0 ? (
        <p className="rounded-2xl border bg-cell px-4 py-3.5 text-subhead text-text-dim">
          {copy.empty}
        </p>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={`${group.ownerType}:${group.ownerLabel ?? ''}`}>
              <h3 className="mb-1.5 px-4 text-label text-text-dim">{ownerTitle(group)}</h3>
              <Group>
                <ul>
                  {group.rows.map((row) => (
                    <li
                      key={row.share_id}
                      className={cn(
                        groupRow,
                        'flex min-h-12.5 flex-wrap items-center justify-between gap-3 px-4 py-2.5',
                      )}
                    >
                      <RowDetails row={row} />
                      {mode === 'client' ? (
                        <a
                          href={sharedDocumentHref(row.share_id)}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={c.client.viewLabel(row.requirement_name)}
                          className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                        >
                          {c.client.view}
                        </a>
                      ) : (
                        <div className="flex flex-wrap items-center gap-3">
                          <span
                            className={cn(
                              'text-footnote',
                              row.active ? 'text-ok-text' : 'text-text-dim',
                            )}
                          >
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
              </Group>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
