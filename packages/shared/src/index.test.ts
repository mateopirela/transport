import { describe, expect, it } from 'vitest';

import { APP_CURRENCY, APP_LOCALE, APP_TIME_ZONE } from './index';

describe('app constants (D02)', () => {
  it('fixes V1 to Spanish (Mexico), MXN and Mexico City time', () => {
    expect(APP_LOCALE).toBe('es-MX');
    expect(APP_CURRENCY).toBe('MXN');
    expect(APP_TIME_ZONE).toBe('America/Mexico_City');
  });

  it('uses values the Intl runtime accepts', () => {
    expect(() =>
      new Intl.NumberFormat(APP_LOCALE, { style: 'currency', currency: APP_CURRENCY }).format(1),
    ).not.toThrow();
    expect(() => new Intl.DateTimeFormat(APP_LOCALE, { timeZone: APP_TIME_ZONE })).not.toThrow();
  });
});
