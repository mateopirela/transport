import { describe, expect, it } from 'vitest';

import {
  brokeredAdminStage,
  brokeredClientStage,
  brokeredMarginCents,
  brokeredQuoteProblem,
} from './brokered';
import { brokeredCopy, PLATFORM_NAME } from './copy/brokered';
import { notificationEmail, notificationWebPath } from './copy/notification-email';
import { notificationContent } from './copy/notifications';
import { Constants } from './db';
import { BROKERED_QUOTE_STATUSES } from './enums';
import { MAX_AMOUNT_CENTS } from './money';

const LOAD = '5eed0005-0000-4000-8000-000000000026';
const TRIP = '5eed0008-0000-4000-8000-000000000099';
const ROUTE = { originCity: 'Apodaca', destinationCity: 'Zapopan', loadId: LOAD };

describe('brokered quote statuses', () => {
  it('mirror the database enum', () => {
    expect(Constants.public.Enums.brokered_quote_status).toEqual([...BROKERED_QUOTE_STATUSES]);
  });
});

describe('brokeredQuoteProblem (admin_quote_brokered_load)', () => {
  it('accepts a rate at or under the client price', () => {
    expect(brokeredQuoteProblem(1_200_000, 1_080_000)).toBeNull();
    expect(brokeredQuoteProblem(1_200_000, 1_200_000)).toBeNull();
    expect(brokeredQuoteProblem(MAX_AMOUNT_CENTS, 1)).toBeNull();
  });

  it('refuses a rate over the client price', () => {
    expect(brokeredQuoteProblem(1_000_000, 1_080_000)).toBe('carrierOverClient');
  });

  it('refuses missing, fractional, zero or too large prices', () => {
    expect(brokeredQuoteProblem(null, 1_080_000)).toBe('clientPrice');
    expect(brokeredQuoteProblem(0, 1_080_000)).toBe('clientPrice');
    expect(brokeredQuoteProblem(1.5, 1)).toBe('clientPrice');
    expect(brokeredQuoteProblem(MAX_AMOUNT_CENTS + 1, 1)).toBe('clientPrice');
    expect(brokeredQuoteProblem(1_200_000, undefined)).toBe('carrierPrice');
    expect(brokeredQuoteProblem(1_200_000, -1)).toBe('carrierPrice');
  });
});

describe('brokeredMarginCents (freight_ledgers.margin_cents)', () => {
  it('is the client price minus the carrier price (the I6 acceptance: $1,200)', () => {
    expect(brokeredMarginCents(1_200_000, 1_080_000)).toBe(120_000);
    expect(brokeredMarginCents(900_000, 900_000)).toBe(0);
  });

  it('never goes negative nor takes fractions', () => {
    expect(() => brokeredMarginCents(1_000_000, 1_080_000)).toThrow(RangeError);
    expect(() => brokeredMarginCents(1_000_000.5, 1)).toThrow(RangeError);
  });
});

describe('brokeredClientStage', () => {
  it('follows the request, the quote and the search', () => {
    expect(brokeredClientStage('requested', 'draft')).toBe('requested');
    expect(brokeredClientStage('quoted', 'draft')).toBe('quoted');
    expect(brokeredClientStage('approved', 'published')).toBe('searching');
    expect(brokeredClientStage('approved', 'negotiating')).toBe('searching');
  });

  it('leaves the rest to the load status', () => {
    expect(brokeredClientStage('approved', 'contracted')).toBeNull();
    expect(brokeredClientStage('quoted', 'cancelled')).toBeNull();
    expect(brokeredClientStage(null, 'published')).toBeNull();
  });
});

describe('brokeredAdminStage', () => {
  it('sorts the inbox', () => {
    expect(brokeredAdminStage('requested', 'draft')).toBe('toQuote');
    expect(brokeredAdminStage('quoted', 'draft')).toBe('waitingClient');
    expect(brokeredAdminStage('approved', 'negotiating')).toBe('published');
    expect(brokeredAdminStage('approved', 'in_progress')).toBe('contracted');
    expect(brokeredAdminStage('requested', 'cancelled')).toBe('closed');
  });
});

describe('brokered notifications', () => {
  it('tell the admins about a request, without amounts', () => {
    const content = notificationContent('brokered_load_requested', ROUTE);
    expect(content.title).toBe('Carga por cotizar');
    expect(content.body).toContain('Apodaca → Zapopan');
    expect(notificationWebPath('admin', ROUTE, 'brokered_load_requested')).toBe(
      `/admin/intermediadas/${LOAD}`,
    );
  });

  it('tell the client its price, and take it to its load', () => {
    const data = { ...ROUTE, amountCents: 1_200_000 };
    expect(notificationContent('brokered_load_quoted', data).body).toBe(
      `${PLATFORM_NAME} cotizó tu carga Apodaca → Zapopan de $12,000.00. Acéptalo para publicarla.`,
    );
    expect(notificationWebPath('shipper', data, 'brokered_load_quoted')).toBe(
      `/cliente/cargas/${LOAD}`,
    );
  });

  it('tell the client the carrier was found, and take it to the trip', () => {
    const data = { ...ROUTE, tripId: TRIP };
    expect(notificationContent('brokered_load_contracted', data).title).toBe(
      'Tu carga tiene transportista',
    );
    expect(notificationWebPath('shipper', data, 'brokered_load_contracted')).toBe(
      `/cliente/viajes/${TRIP}`,
    );
  });

  it("take the admins to the brokered load for the carriers' offers to Transport", () => {
    const data = { ...ROUTE, amountCents: 1_150_000, brokered: true, negotiationId: TRIP };
    expect(notificationWebPath('admin', data, 'offer_received')).toBe(
      `/admin/intermediadas/${LOAD}`,
    );
    expect(notificationWebPath('admin', { ...ROUTE, amountCents: 1 }, 'offer_received')).toBe(
      '/admin',
    );
    const email = notificationEmail('brokered_load_requested', ROUTE, {
      role: 'admin',
      siteUrl: 'https://transport.example',
    });
    expect(email.text).toContain(`https://transport.example/admin/intermediadas/${LOAD}`);
  });

  it('keep every text of the screens in Spanish copy', () => {
    expect(brokeredCopy.badge).toBe('Publicada por Transport');
    expect(brokeredCopy.shipper.approve('$12,000.00')).toBe('Aceptar $12,000.00');
    expect(brokeredCopy.admin.pendingOffers(1)).toBe('1 oferta pendiente');
    expect(brokeredCopy.admin.pendingOffers(3)).toBe('3 ofertas pendientes');
  });
});
