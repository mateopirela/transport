import { describe, expect, it } from 'vitest';

import { PROVIDER_STATUSES } from './enums';
import {
  groupSharedDocuments,
  providerActions,
  providerState,
  type SharedDocumentRow,
} from './shared-documents';

function row(overrides: Partial<SharedDocumentRow>): SharedDocumentRow {
  return {
    share_id: crypto.randomUUID(),
    owner_type: 'company',
    owner_label: null,
    requirement_code: 'tax_status_certificate',
    requirement_name: 'Constancia de situación fiscal',
    mime_type: 'application/pdf',
    expires_at: null,
    granted_at: '2026-10-18T12:00:00Z',
    granted_reason: 'offer_accepted',
    revoked_at: null,
    revoked_reason: null,
    active: true,
    ...overrides,
  };
}

describe('groupSharedDocuments', () => {
  it('puts the company first, then each unit and each operator', () => {
    const groups = groupSharedDocuments([
      row({ owner_type: 'operator', owner_label: 'Pedro López', granted_reason: 'trip_assigned' }),
      row({ owner_type: 'vehicle', owner_label: 'NLA-1234', granted_reason: 'trip_assigned' }),
      row({}),
      row({ owner_type: 'vehicle', owner_label: 'JAL-9999', granted_reason: 'trip_assigned' }),
    ]);
    expect(groups.map((g) => [g.ownerType, g.ownerLabel])).toEqual([
      ['company', null],
      ['vehicle', 'JAL-9999'],
      ['vehicle', 'NLA-1234'],
      ['operator', 'Pedro López'],
    ]);
  });

  it('lists the shares in force before the revoked ones', () => {
    const revoked = row({ active: false, revoked_reason: 'manager_revoked', revoked_at: 'x' });
    const active = row({ requirement_code: 'legal' });
    const [group] = groupSharedDocuments([revoked, active]);
    expect(group?.rows).toEqual([active, revoked]);
  });

  it('returns nothing without shares', () => {
    expect(groupSharedDocuments([])).toEqual([]);
  });
});

describe('providerActions', () => {
  it('mirrors the transitions of set_provider_status', () => {
    expect(providerActions('pending')).toEqual(['approved', 'rejected']);
    expect(providerActions('approved')).toEqual(['revoked']);
    expect(providerActions('rejected')).toEqual(['approved']);
    expect(providerActions('revoked')).toEqual(['approved', 'rejected']);
  });

  it('never offers the current status', () => {
    for (const status of PROVIDER_STATUSES) {
      expect(providerActions(status)).not.toContain(status);
    }
  });

  it('treats a missing decision as pending', () => {
    expect(providerState(null)).toBe('pending');
    expect(providerState(undefined)).toBe('pending');
    expect(providerState('approved')).toBe('approved');
  });
});
