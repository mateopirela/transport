import { describe, expect, it } from 'vitest';

import { managerCompanyErrorCopy as e } from './copy/manager-company';
import {
  businessUnitNames,
  groupByBusinessUnit,
  managerCompanyErrorText,
  pendingInvitations,
  type InvitationSummary,
} from './manager-company';

const units = [
  { id: 'r', name: 'Regional Monterrey' },
  { id: 'b', name: 'Bajío' },
  { id: 'c', name: 'Corredor MTY–GDL' },
];

describe('groupByBusinessUnit', () => {
  const rows = [
    { id: '1', unit: 'c' },
    { id: '2', unit: 'r' },
    { id: '3', unit: 'c' },
    { id: '4', unit: 'archived' },
    { id: '5', unit: null },
  ];

  it('lists every business unit by name, empty ones included, keeping the row order', () => {
    const groups = groupByBusinessUnit(units, rows, (row) => row.unit);
    expect(groups.map((g) => g.unit?.name ?? null)).toEqual([
      'Bajío',
      'Corredor MTY–GDL',
      'Regional Monterrey',
      null,
    ]);
    expect(groups[0]?.items).toEqual([]);
    expect(groups[1]?.items.map((r) => r.id)).toEqual(['1', '3']);
    expect(groups[2]?.items.map((r) => r.id)).toEqual(['2']);
  });

  it('puts the rows of unknown or archived business units last, in one group', () => {
    const groups = groupByBusinessUnit(units, rows, (row) => row.unit);
    expect(groups.at(-1)).toEqual({ unit: null, items: [rows[3], rows[4]] });
  });

  it('has no group without unit when every row has a listed one', () => {
    const groups = groupByBusinessUnit(units, rows.slice(0, 3), (row) => row.unit);
    expect(groups).toHaveLength(3);
    expect(groupByBusinessUnit([], [], () => null)).toEqual([]);
  });
});

describe('pendingInvitations', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  const base: InvitationSummary = {
    id: 'x',
    kind: 'operator',
    business_unit_ids: ['c'],
    operator_id: null,
    invitee_name: null,
    expires_at: '2026-10-25T12:00:00Z',
    accepted_at: null,
    revoked_at: null,
  };

  it('keeps only the invitations that can still be used, soonest to expire first', () => {
    const list = [
      { ...base, id: 'later', expires_at: '2026-10-27T12:00:00Z' },
      { ...base, id: 'accepted', accepted_at: '2026-10-19T12:00:00Z' },
      { ...base, id: 'revoked', revoked_at: '2026-10-19T12:00:00Z' },
      { ...base, id: 'expired', expires_at: '2026-10-20T12:00:00Z' },
      { ...base, id: 'sooner', expires_at: '2026-10-21T12:00:00Z' },
    ];
    expect(pendingInvitations(list, now).map((i) => i.id)).toEqual(['sooner', 'later']);
  });
});

describe('businessUnitNames', () => {
  it('names the business units of an invitation and skips unknown ids', () => {
    expect(businessUnitNames(['c', 'gone', 'r'], units)).toEqual([
      'Regional Monterrey',
      'Corredor MTY–GDL',
    ]);
  });
});

describe('managerCompanyErrorText', () => {
  it('maps the errors of the manager RPCs to Spanish copy', () => {
    const cases: [string, string][] = [
      ['only the manager can manage the company', e.managerOnly],
      ['only the manager invites coordinators', e.managerOnly],
      ['business unit name must be 1 to 80 characters', e.nameLength],
      [
        'duplicate key value violates unique constraint "business_units_company_name_key"',
        e.nameTaken,
      ],
      ['cannot archive the only business unit', e.onlyBusinessUnit],
      ['business unit has active units or operators', e.businessUnitNotEmpty],
      ['business unit has open negotiations or trips', e.businessUnitOpenWork],
      ['business unit is archived', e.businessUnitArchived],
      ['business unit not found', e.businessUnitNotFound],
      ['at least one business unit is required', e.unitsRequired],
      ['coordinator not found', e.coordinatorNotFound],
      ['cannot remove yourself', e.cannotRemoveSelf],
      ['only coordinators can be removed', e.onlyCoordinators],
      ['cannot move: it is committed to a trip', e.committed],
      ['vehicle not found', e.notFound],
      ['operator is archived', e.archived],
      ['operator has no account', e.operatorHasNoAccount],
    ];
    for (const [message, text] of cases) expect(managerCompanyErrorText(message)).toBe(text);
  });

  it('returns null for anything else, so raw database text is never shown', () => {
    expect(managerCompanyErrorText('')).toBeNull();
    expect(
      managerCompanyErrorText('permission denied for function archive_business_unit'),
    ).toBeNull();
    expect(managerCompanyErrorText('operator not found or without account')).toBeNull();
  });
});
