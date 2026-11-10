import { describe, expect, it } from 'vitest';

import {
  addCalendarDays,
  collectionsTotals,
  commissionCents,
  compareFreightOrder,
  effectiveCarrierStatus,
  effectiveClientStatus,
  fetchFreightPages,
  FREIGHT_PAGE_SIZE,
  formatBasisPoints,
  freightCarrierStatusTone,
  freightClientStatusTone,
  freightAdminErrorText,
  freightDueOn,
  freightSplit,
  isPaymentTermsDays,
  isValidCommissionBps,
  isValidSpeiReference,
  normalizeSpeiReference,
  parseFreightPayments,
  portfolioTotals,
} from '.';
import { FREIGHT_CARRIER_STATUSES, FREIGHT_CLIENT_STATUSES } from '../enums';
import {
  freightCarrierStatusLabels,
  freightClientStatusLabels,
  freightCopy,
} from '../copy/freight';

// The same cases as 53_freight_ledger.test.sql checks against
// freight_commission_cents (I.0.1: one rounding, mirrored in SQL).
const COMMISSION_CASES: [amount: number, bps: number, commission: number][] = [
  [1_000_000, 300, 30_000], // $10,000 at 3 % (the acceptance trip)
  [1_000_050, 300, 30_002], // 30001.5 → half up
  [1_000_016, 300, 30_000], // 30000.48 → down
  [1_000_017, 300, 30_001], // 30000.51 → up
  [4_100_000, 500, 205_000],
  [1, 500, 0], // 0.05 → 0
  [10, 500, 1], // 0.5 → half up
  [999_999, 0, 0], // no commission (§I.2)
  [10_000_000_000, 500, 500_000_000], // MAX_AMOUNT_CENTS, exact
];

describe('commissionCents', () => {
  it.each(COMMISSION_CASES)('%i cents at %i bps is %i', (amount, bps, commission) => {
    expect(commissionCents(amount, bps)).toBe(commission);
  });

  it('rejects fractions, negatives and floats', () => {
    expect(() => commissionCents(-1, 300)).toThrow(RangeError);
    expect(() => commissionCents(10.5, 300)).toThrow(RangeError);
    expect(() => commissionCents(100, 2.5)).toThrow(RangeError);
    expect(() => commissionCents(100, 10_001)).toThrow(RangeError);
  });
});

describe('freightSplit', () => {
  it('splits $10,000 at 3 % into $300 and $9,700', () => {
    expect(freightSplit(1_000_000, 300)).toEqual({
      clientAmountCents: 1_000_000,
      commissionBps: 300,
      commissionCents: 30_000,
      carrierNetCents: 970_000,
    });
  });

  it.each(COMMISSION_CASES)('the parts of %i at %i bps add up to the total', (amount, bps) => {
    const split = freightSplit(amount, bps);
    expect(split.commissionCents + split.carrierNetCents).toBe(amount);
  });
});

describe('validation', () => {
  it('accepts 0 or 300..500 basis points only', () => {
    for (const bps of [0, 300, 301, 450, 500]) expect(isValidCommissionBps(bps)).toBe(true);
    for (const bps of [-1, 1, 250, 299, 501, 1000, 300.5, '300', null]) {
      expect(isValidCommissionBps(bps)).toBe(false);
    }
  });

  it('accepts 15, 30 or 60 days of terms', () => {
    expect([15, 30, 60].every(isPaymentTermsDays)).toBe(true);
    expect([0, 7, 45, 90, '30', null].some(isPaymentTermsDays)).toBe(false);
  });

  it('normalizes and validates SPEI references like Postgres', () => {
    expect(normalizeSpeiReference(' mban 0100 2411 ')).toBe('MBAN01002411');
    expect(isValidSpeiReference('MBAN01002411')).toBe(true);
    expect(isValidSpeiReference('')).toBe(false);
    expect(isValidSpeiReference('A'.repeat(31))).toBe(false);
    expect(isValidSpeiReference('ABC-123')).toBe(false);
  });
});

describe('dates (calendar days in America/Mexico_City)', () => {
  it('adds calendar days across months and leap years', () => {
    expect(addCalendarDays('2026-11-10', 30)).toBe('2026-12-10');
    expect(addCalendarDays('2026-12-20', 15)).toBe('2027-01-04');
    expect(addCalendarDays('2028-02-15', 15)).toBe('2028-03-01');
    expect(addCalendarDays('2027-02-15', 15)).toBe('2027-03-02');
    expect(() => addCalendarDays('2026-02-30', 1)).toThrow(RangeError);
  });

  it('counts from the day of the delivery in Mexico City, not in UTC', () => {
    // 23:30 in Mexico City on Nov 10 is already Nov 11 in UTC.
    expect(freightDueOn('2026-11-11T05:30:00Z', 30)).toBe('2026-12-10');
    expect(freightDueOn('2026-11-10T06:30:00Z', 15)).toBe('2026-11-25');
    expect(freightDueOn('2026-11-10T18:00:00Z', 60)).toBe('2027-01-09');
  });

  it('has no due date without a delivery or without terms', () => {
    expect(freightDueOn(null, 30)).toBeNull();
    expect(freightDueOn('2026-11-10T18:00:00Z', null)).toBeNull();
  });
});

describe('statuses at read time', () => {
  const today = '2026-11-10';

  it('makes overdue only a pending or invoiced client past its date', () => {
    expect(effectiveClientStatus('pending', '2026-11-09', today)).toBe('overdue');
    expect(effectiveClientStatus('invoiced', '2026-11-09', today)).toBe('overdue');
    expect(effectiveClientStatus('pending', today, today)).toBe('pending');
    expect(effectiveClientStatus('pending', null, today)).toBe('pending');
    expect(effectiveClientStatus('paid', '2026-11-01', today)).toBe('paid');
  });

  it('holds only a pending carrier payment past its date while the client has not paid', () => {
    expect(effectiveCarrierStatus('pending', '2026-11-09', false, today)).toBe('on_hold');
    expect(effectiveCarrierStatus('pending', '2026-11-09', true, today)).toBe('pending');
    expect(effectiveCarrierStatus('pending', today, false, today)).toBe('pending');
    // Quick pay (I4): Fulmis takes the client's delay; it never goes back.
    expect(effectiveCarrierStatus('quick_pay_requested', '2026-11-01', false, today)).toBe(
      'quick_pay_requested',
    );
    expect(effectiveCarrierStatus('scheduled', '2026-11-01', false, today)).toBe('scheduled');
  });
});

describe('totals', () => {
  it('adds up Cobranza: receivable, held and paid this month', () => {
    const totals = collectionsTotals(
      [
        { status: 'pending', pendingCents: 970_000, payments: [] },
        { status: 'scheduled', pendingCents: 100_000, payments: [] },
        { status: 'on_hold', pendingCents: 388_000, payments: [] },
        {
          status: 'paid',
          pendingCents: 0,
          payments: [
            { amountCents: 500_000, paidOn: '2026-11-03', speiReference: 'A1' },
            { amountCents: 200_000, paidOn: '2026-10-31', speiReference: 'A2' },
          ],
        },
        { status: 'cancelled', pendingCents: 50_000, payments: [] },
      ],
      '2026-11-10',
    );
    expect(totals).toEqual({
      receivableCents: 1_070_000,
      onHoldCents: 388_000,
      paidThisMonthCents: 500_000,
    });
  });

  it('adds up Cartera: balance, overdue and upcoming', () => {
    expect(
      portfolioTotals([
        { status: 'pending', pendingCents: 1_000_000 },
        { status: 'overdue', pendingCents: 400_000 },
        { status: 'invoiced', pendingCents: 100_000 },
        { status: 'paid', pendingCents: 0 },
        { status: 'cancelled', pendingCents: 999 },
        { status: 'written_off', pendingCents: 777 },
      ]),
    ).toEqual({ balanceCents: 1_500_000, overdueCents: 400_000, upcomingCents: 1_100_000 });
  });
});

describe('labels and tones', () => {
  it('formats basis points without floats', () => {
    expect(formatBasisPoints(300)).toBe('3 %');
    expect(formatBasisPoints(250)).toBe('2.5 %');
    expect(formatBasisPoints(325)).toBe('3.25 %');
    expect(formatBasisPoints(0)).toBe('0 %');
  });

  it('has a Spanish label and a tone for every status', () => {
    for (const status of FREIGHT_CLIENT_STATUSES) {
      expect(freightClientStatusLabels[status]).toBeTruthy();
      expect(freightClientStatusTone(status)).toBeTruthy();
    }
    for (const status of FREIGHT_CARRIER_STATUSES) {
      expect(freightCarrierStatusLabels[status]).toBeTruthy();
      expect(freightCarrierStatusTone(status)).toBeTruthy();
    }
    expect(freightCarrierStatusLabels.on_hold).toBe('Retenido');
  });

  it('parses the payments of a read RPC and drops malformed ones', () => {
    expect(
      parseFreightPayments([
        { amountCents: 970_000, paidOn: '2026-11-10', speiReference: 'MBAN0100' },
        { amountCents: 1.5, paidOn: '2026-11-10', speiReference: 'X' },
        { amountCents: 1, paidOn: 'ayer', speiReference: 'X' },
        null,
      ]),
    ).toEqual([{ amountCents: 970_000, paidOn: '2026-11-10', speiReference: 'MBAN0100' }]);
    expect(parseFreightPayments(null)).toEqual([]);
  });
});

describe('freightAdminErrorText', () => {
  it('maps the errors of the admin RPCs to Spanish', () => {
    const e = freightCopy.admin.errors;
    expect(freightAdminErrorText({ code: '42501' })).toBe(e.notAdmin);
    expect(freightAdminErrorText({ code: '23505' })).toBe(e.duplicateReference);
    expect(
      freightAdminErrorText({ code: '22023', message: 'the payment is more than what is owed' }),
    ).toBe(e.overpaid);
    expect(
      freightAdminErrorText({
        code: '22023',
        message: 'the payment date must be between the trip creation and today',
      }),
    ).toBe(e.date);
    expect(freightAdminErrorText({ code: '55000', message: 'this side is already paid' })).toBe(
      e.closed,
    );
    expect(
      freightAdminErrorText({ code: '55000', message: 'no review pending for this trip' }),
    ).toBe(e.noReview);
    // D33-E1: no payment to the carrier before the client paid.
    expect(
      freightAdminErrorText({ code: '55000', message: 'the client has not paid this trip yet' }),
    ).toBe(e.clientUnpaid);
    expect(freightAdminErrorText({ code: 'XX000' })).toBe(e.generic);
  });
});

describe('compareFreightOrder', () => {
  const key = (
    ledgerId: string,
    dueOn: string | null,
    tripCreatedAt: string,
    needsReview = false,
  ) => ({
    ledgerId,
    dueOn,
    tripCreatedAt,
    needsReview,
  });

  it('sorts like the RPCs: review, due date (none last), newest trip, ledger id', () => {
    const rows = [
      key('f', null, '2026-11-09T10:00:00+00:00'),
      key('e', '2026-12-04', '2026-11-01T10:00:00+00:00'),
      key('d', '2026-12-03', '2026-11-01T10:00:00+00:00'),
      key('c', '2026-12-03', '2026-11-05T10:00:00+00:00'),
      key('b', '2026-12-03', '2026-11-05T10:00:00+00:00'),
      key('a', '2026-12-30', '2026-10-01T10:00:00+00:00', true),
    ];
    expect([...rows].sort(compareFreightOrder).map((r) => r.ledgerId)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
    ]);
  });
});

describe('fetchFreightPages', () => {
  const ids = Array.from({ length: FREIGHT_PAGE_SIZE * 2 + 1 }, (_, i) =>
    String(i).padStart(6, '0'),
  );

  it('reads past the 1,000-row cap, asking for the rows after the last ledger id', async () => {
    const afters: (string | null)[] = [];
    const rows = await fetchFreightPages((after) => {
      afters.push(after);
      const data = ids
        .filter((id) => after === null || id > after)
        .slice(0, FREIGHT_PAGE_SIZE)
        .map((ledger_id) => ({ ledger_id }));
      return Promise.resolve({ data, error: null });
    }, 'rpc');
    expect(rows.map((r) => r.ledger_id)).toEqual(ids);
    expect(afters).toEqual([null, ids[FREIGHT_PAGE_SIZE - 1], ids[FREIGHT_PAGE_SIZE * 2 - 1]]);
  });

  it('neither skips nor repeats a row when another one leaves between pages', async () => {
    let live = [...ids];
    let first = true;
    const rows = await fetchFreightPages((after) => {
      const data = live
        .filter((id) => after === null || id > after)
        .slice(0, FREIGHT_PAGE_SIZE)
        .map((ledger_id) => ({ ledger_id }));
      // A trip of the first page is cancelled while the page loads.
      if (first) live = live.filter((id) => id !== ids[10]);
      first = false;
      return Promise.resolve({ data, error: null });
    }, 'rpc');
    expect(rows.map((r) => r.ledger_id)).toEqual(ids);
  });

  it('fails with the name of the RPC', async () => {
    await expect(
      fetchFreightPages(
        () => Promise.resolve({ data: null, error: { message: 'boom' } }),
        'carrier_freight_ledger',
      ),
    ).rejects.toThrow('carrier_freight_ledger failed: boom');
  });
});
