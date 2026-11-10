import { brokeredCopy, loadsCopy } from '@transport/shared';
import { describe, expect, it } from 'vitest';

import { loadErrorMessage } from '../loads/errors';
import { brokeredAdminErrorMessage } from './errors';

const e = brokeredCopy.errors;

describe('brokeredAdminErrorMessage', () => {
  it('explains the price rules of a brokered load', () => {
    expect(
      brokeredAdminErrorMessage({
        code: '22023',
        message: 'invalid quote: the carrier price cannot be over the client price',
      }),
    ).toBe(e.carrierOverClient);
    expect(
      brokeredAdminErrorMessage({
        code: '22023',
        message: 'the carrier price cannot be over the client price',
      }),
    ).toBe(e.overClientPrice);
    expect(
      brokeredAdminErrorMessage({
        code: '55000',
        message: 'the client already approved its price',
      }),
    ).toBe(e.clientApproved);
    expect(
      brokeredAdminErrorMessage({
        code: '55000',
        message: 'cannot quote a load in status contracted',
      }),
    ).toBe(e.notQuotable);
    expect(
      brokeredAdminErrorMessage({ code: '55000', message: 'pickup window already ended' }),
    ).toBe(loadsCopy.errors.pickupEnded);
  });

  it('never shows database text', () => {
    expect(brokeredAdminErrorMessage({ code: 'XX000', message: 'boom' })).toBe(e.generic);
    expect(brokeredAdminErrorMessage(null)).toBe(e.generic);
    expect(
      brokeredAdminErrorMessage({
        code: '55000',
        message: 'offer is no longer pending (status x)',
      }),
    ).toBe(loadsCopy.errors.invalidStatus);
  });
});

describe('loadErrorMessage for brokered loads', () => {
  it('tells the client its quote changed or cannot be approved', () => {
    expect(loadErrorMessage({ code: '55000', message: 'the quote changed' })).toBe(e.quoteChanged);
    expect(loadErrorMessage({ code: '55000', message: 'there is no quote to approve' })).toBe(
      e.noQuote,
    );
    expect(loadErrorMessage({ code: '55000', message: 'a brokered load cannot be edited' })).toBe(
      e.notEditable,
    );
  });
});
