import { shareLinksCopy } from '@transport/shared';
import { describe, expect, it } from 'vitest';

import { internalShareTarget, shareSheetMessage, shareTokenParam } from './share-api';

const token = 'Qm9vay1vZi1zaGFyZS10b2tlbnMtMzItYnl0ZXMtMDA';

describe('internalShareTarget', () => {
  it('prefers the web page of the team when the public site is configured', () => {
    expect(internalShareTarget('https://transport.mx', token)).toBe(
      `https://transport.mx/transportista/compartido/${token}`,
    );
  });

  it('falls back to the deep link of the app without a safe site', () => {
    for (const site of [undefined, '', 'http://transport.mx', 'nope']) {
      expect(internalShareTarget(site, token)).toBe(`transport://compartido/${token}`);
    }
  });
});

describe('shareSheetMessage', () => {
  it('puts the sentence before the link', () => {
    const url = `https://transport.mx/transportista/compartido/${token}`;
    expect(shareSheetMessage('Monterrey → Guadalajara', url)).toBe(
      `${shareLinksCopy.app.message('Monterrey → Guadalajara')} ${url}`,
    );
  });
});

describe('shareTokenParam', () => {
  it('reads the first value and trims it', () => {
    expect(shareTokenParam(` ${token} `)).toBe(token);
    expect(shareTokenParam([token, 'other'])).toBe(token);
    expect(shareTokenParam(undefined)).toBe('');
  });
});
