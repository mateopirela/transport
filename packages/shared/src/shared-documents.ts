// Documents shared with the shipper of a trip and the provider approval (D21,
// G6). Pure, so the shipper web, the carrier web and the carrier app group the
// shares and offer the provider actions the same way; Postgres validates
// everything again (trip_shared_documents, set_provider_status).
import type { DocumentShareReason, DocumentShareRevokeReason, ProviderStatus } from './enums';
import type { DocumentOwnerType } from './verification';

/** One row of the trip_shared_documents RPC (no storage path, ever). */
export interface SharedDocumentRow {
  share_id: string;
  owner_type: DocumentOwnerType;
  /** Plate of the unit or name of the operator; null for the company. */
  owner_label: string | null;
  requirement_code: string;
  requirement_name: string;
  mime_type: string | null;
  expires_at: string | null;
  granted_at: string;
  granted_reason: DocumentShareReason;
  revoked_at: string | null;
  revoked_reason: DocumentShareRevokeReason | null;
  /** In force: the shipper can open it now. */
  active: boolean;
}

export interface SharedDocumentGroup {
  ownerType: DocumentOwnerType;
  ownerLabel: string | null;
  rows: SharedDocumentRow[];
}

const OWNER_ORDER: Record<DocumentOwnerType, number> = { company: 0, vehicle: 1, operator: 2 };

/**
 * Shares grouped by owner (the company, then each unit, then each operator),
 * the ones in force first within each group.
 */
export function groupSharedDocuments(rows: readonly SharedDocumentRow[]): SharedDocumentGroup[] {
  const groups = new Map<string, SharedDocumentGroup>();
  for (const row of rows) {
    const key = `${row.owner_type}:${row.owner_label ?? ''}`;
    const group = groups.get(key) ?? {
      ownerType: row.owner_type,
      ownerLabel: row.owner_label,
      rows: [],
    };
    group.rows.push(row);
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort(
      (a, b) =>
        OWNER_ORDER[a.ownerType] - OWNER_ORDER[b.ownerType] ||
        (a.ownerLabel ?? '').localeCompare(b.ownerLabel ?? ''),
    )
    .map((group) => ({
      ...group,
      rows: [...group.rows].sort((a, b) => Number(b.active) - Number(a.active)),
    }));
}

/** Pending (no decision yet) or a stored status. */
export type ProviderState = ProviderStatus | 'pending';

export function providerState(status: ProviderStatus | null | undefined): ProviderState {
  return status ?? 'pending';
}

/**
 * The statuses the shipper can move a carrier to (mirror of
 * set_provider_status): approve from pending, rejected or revoked; reject from
 * pending or revoked; revoke only an approval.
 */
export function providerActions(state: ProviderState): ProviderStatus[] {
  switch (state) {
    case 'pending':
    case 'revoked':
      return ['approved', 'rejected'];
    case 'rejected':
      return ['approved'];
    case 'approved':
      return ['revoked'];
  }
}
