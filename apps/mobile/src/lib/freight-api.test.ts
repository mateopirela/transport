import {
  CFDI_XML_MAX_BYTES,
  FREIGHT_PAGE_SIZE,
  freightInvoiceFailureLabels,
  freightInvoicesCopy,
  quickPayCopy,
} from '@transport/shared';
import { describe, expect, it, vi } from 'vitest';

import {
  classifyCfdiFiles,
  loadCarrierInvoices,
  loadCollections,
  loadQuickPayFee,
  requestQuickPay,
  uploadCarrierCfdi,
} from './freight-api';
import type { Supabase } from './supabase';

const id = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;

function row(i: number) {
  return {
    ledger_id: id(i),
    trip_id: `trip-${i}`,
    // Even trips are due the 3rd, odd ones the 4th; the first trip has none.
    due_on: i === 0 ? null : `2026-12-0${3 + (i % 2)}`,
    trip_created_at: new Date(Date.UTC(2026, 10, 1) + i * 1000).toISOString(),
    freight_cents: 1000000,
    commission_cents: 30000,
    net_cents: 970000,
    paid_cents: 0,
    pending_cents: 970000,
    payments: [],
  };
}

/** carrier_freight_ledger over `total` rows, read by ledger id after `gt`. */
function fakeClient(total: number) {
  const calls: (string | null)[] = [];
  const rows = Array.from({ length: total }, (_, i) => row(i));
  const page = (after: string | null) => ({
    gt: (column: string, value: string) => {
      expect(column).toBe('ledger_id');
      return page(value);
    },
    order: (column: string) => {
      expect(column).toBe('ledger_id');
      return page(after);
    },
    limit: (n: number) => {
      calls.push(after);
      const data = rows.filter((r) => after === null || r.ledger_id > after).slice(0, n);
      return Promise.resolve({ data, error: null });
    },
  });
  const client = {
    rpc: (name: string) => {
      expect(name).toBe('carrier_freight_ledger');
      return page(null);
    },
  } as unknown as Supabase;
  return { client, calls };
}

describe('loadCollections', () => {
  it('reads every trip past the 1,000-row cap by ledger id, in the order of the RPC', async () => {
    const { client, calls } = fakeClient(FREIGHT_PAGE_SIZE + 3);
    const rows = await loadCollections(client);
    expect(rows).toHaveLength(FREIGHT_PAGE_SIZE + 3);
    expect(new Set(rows.map((r) => r.ledger_id)).size).toBe(FREIGHT_PAGE_SIZE + 3);
    expect(calls).toEqual([null, id(FREIGHT_PAGE_SIZE - 1)]);
    // Due the 3rd first (newest trip first), then the 4th, the one without a date last.
    expect(rows[0]?.ledger_id).toBe(id(FREIGHT_PAGE_SIZE + 2));
    expect(rows[0]?.due_on).toBe('2026-12-03');
    expect(rows.at(-1)?.ledger_id).toBe(id(0));
    expect(rows[0]?.net_cents).toBe(970000);
  });
});

describe('classifyCfdiFiles', () => {
  const xml = { uri: 'file:///a.xml', name: 'F101.XML', mimeType: 'text/xml', size: 4000 };
  const pdf = { uri: 'file:///a.pdf', name: 'F101.pdf', mimeType: 'application/pdf', size: 9000 };

  it('takes the XML and the optional PDF picked together', () => {
    expect(classifyCfdiFiles([pdf, xml])).toEqual({
      status: 'picked',
      xml: { uri: xml.uri, name: xml.name, type: 'application/xml' },
      pdf: { uri: pdf.uri, name: pdf.name, type: 'application/pdf' },
    });
    expect(classifyCfdiFiles([{ ...xml, mimeType: null }])).toMatchObject({
      status: 'picked',
      pdf: null,
    });
  });

  it('needs an XML within the limits', () => {
    expect(classifyCfdiFiles([pdf])).toEqual({ status: 'invalid', failure: 'xml_missing' });
    expect(classifyCfdiFiles([{ ...xml, size: CFDI_XML_MAX_BYTES + 1 }])).toEqual({
      status: 'invalid',
      failure: 'too_large',
    });
    expect(classifyCfdiFiles([xml, { ...pdf, size: 6_000_000 }])).toEqual({
      status: 'invalid',
      failure: 'pdf_too_large',
    });
  });
});

describe('uploadCarrierCfdi', () => {
  const files = {
    xml: { uri: 'file:///a.xml', name: 'a.xml', type: 'application/xml' },
    pdf: null,
  };

  it('sends the trip and the files to validate-carrier-cfdi', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { validation: 'validated' }, error: null });
    const client = { functions: { invoke } } as unknown as Supabase;
    expect(await uploadCarrierCfdi(client, 'trip-1', files)).toEqual({
      ok: true,
      validation: 'validated',
    });
    const [name, options] = invoke.mock.calls[0] as [string, { body: FormData }];
    expect(name).toBe('validate-carrier-cfdi');
    expect(options.body.get('tripId')).toBe('trip-1');
    expect(options.body.has('xml')).toBe(true);
    expect(options.body.has('pdf')).toBe(false);
  });

  it('says every rule that failed', async () => {
    const context = new Response(
      JSON.stringify({ error: 'invalid_cfdi', failures: ['receiver_mismatch'] }),
      { status: 422 },
    );
    const invoke = vi.fn().mockResolvedValue({ data: null, error: { context } });
    const client = { functions: { invoke } } as unknown as Supabase;
    expect(await uploadCarrierCfdi(client, 'trip-1', files)).toEqual({
      ok: false,
      errors: [freightInvoiceFailureLabels.receiver_mismatch],
    });
    const offline = vi.fn().mockResolvedValue({ data: null, error: new Error('offline') });
    expect(
      await uploadCarrierCfdi(
        { functions: { invoke: offline } } as unknown as Supabase,
        't',
        files,
      ),
    ).toEqual({ ok: false, errors: [freightInvoicesCopy.errors.generic] });
  });
});

describe('loadCarrierInvoices', () => {
  it('reads the carrier direction only, by trip', async () => {
    const filters: [string, string][] = [];
    const query = {
      select: () => query,
      eq: (column: string, value: string) => {
        filters.push([column, value]);
        return query;
      },
      order: () => query,
      limit: () =>
        Promise.resolve({
          data: [
            {
              id: id(1),
              trip_id: 'trip-1',
              cfdi_uuid: 'u',
              issued_at: '2026-11-06T16:00:00Z',
              validation: 'unvalidated',
            },
          ],
          error: null,
        }),
    };
    const client = { from: () => query } as unknown as Supabase;
    const invoices = await loadCarrierInvoices(client);
    expect(filters).toEqual([['direction', 'carrier_to_fulmis']]);
    expect(invoices.get('trip-1')).toEqual({
      cfdiUuid: 'u',
      issuedAt: '2026-11-06T16:00:00Z',
      validation: 'unvalidated',
    });
  });
});

describe('quick pay (I4)', () => {
  it('reads the quick pay columns of each trip', async () => {
    const quick = {
      ...row(1),
      status: 'quick_pay_requested',
      quick_pay_fee_bps: 250,
      quick_pay_fee_cents: '24250',
      quick_pay_net_cents: 945_750,
      quick_pay_blocker: null,
    };
    const client = {
      rpc: () => ({
        order: () => ({ limit: () => Promise.resolve({ data: [quick, row(2)], error: null }) }),
      }),
    } as unknown as Supabase;
    const rows = await loadCollections(client);
    const first = rows.find((r) => r.ledger_id === id(1));
    const second = rows.find((r) => r.ledger_id === id(2));
    expect(first).toMatchObject({
      quick_pay_fee_cents: 24_250,
      quick_pay_net_cents: 945_750,
      quick_pay_blocker: null,
    });
    // A row without the columns (or with an unknown blocker) offers nothing.
    expect(second).toMatchObject({ quick_pay_fee_cents: null, quick_pay_net_cents: null });
  });

  it('asks with the fee shown and tells a changed fee', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: {}, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { code: '55000', message: 'the quick pay fee changed', details: 'fee_changed' },
      });
    const client = { rpc } as unknown as Supabase;
    expect(await requestQuickPay(client, 'trip-1', 250)).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('request_quick_pay', { p_trip_id: 'trip-1', p_fee_bps: 250 });
    expect(await requestQuickPay(client, 'trip-1', 250)).toEqual({
      ok: false,
      error: quickPayCopy.errors.feeChanged,
      feeChanged: true,
    });
  });

  it('reads the fee, or nothing when it cannot', async () => {
    const ok = { rpc: () => Promise.resolve({ data: 250, error: null }) } as unknown as Supabase;
    expect(await loadQuickPayFee(ok)).toBe(250);
    const denied = {
      rpc: () => Promise.resolve({ data: null, error: { code: '42501', message: 'no' } }),
    } as unknown as Supabase;
    expect(await loadQuickPayFee(denied)).toBeNull();
  });
});
