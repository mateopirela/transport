import { describe, expect, it } from 'vitest';

import {
  INVITATION_DEFAULT_VALID_HOURS,
  INVITATION_MAX_VALID_HOURS,
  INVITATION_TOKEN_LENGTH,
  invitationDeepLink,
  invitationUrl,
  isInvitationToken,
  parseInvitationLink,
} from './invitation-link';

const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO_-';

describe('invitation links (G1b)', () => {
  it('matches the token create_invitation returns (32 bytes in base64url)', () => {
    expect(TOKEN).toHaveLength(INVITATION_TOKEN_LENGTH);
    expect(isInvitationToken(TOKEN)).toBe(true);
    expect(isInvitationToken(TOKEN.slice(1))).toBe(false);
    expect(isInvitationToken(`${TOKEN}=`)).toBe(false);
    expect(isInvitationToken(TOKEN.replace('_', '+'))).toBe(false);
    expect(isInvitationToken('')).toBe(false);
    expect(isInvitationToken(null)).toBe(false);
  });

  it('keeps the lifetimes of the database (7 days by default, 30 at most)', () => {
    expect(INVITATION_DEFAULT_VALID_HOURS).toBe(168);
    expect(INVITATION_MAX_VALID_HOURS).toBe(720);
  });

  it('builds the web link without doubling slashes', () => {
    expect(invitationUrl('https://app.transport.mx', TOKEN)).toBe(
      `https://app.transport.mx/invitacion/${TOKEN}`,
    );
    expect(invitationUrl('http://127.0.0.1:3000/', TOKEN)).toBe(
      `http://127.0.0.1:3000/invitacion/${TOKEN}`,
    );
  });

  it('builds the deep link of the app', () => {
    expect(invitationDeepLink(TOKEN)).toBe(`transport://invitacion/${TOKEN}`);
  });

  it('refuses to build a link from something that is not a token', () => {
    expect(() => invitationUrl('https://app.transport.mx', 'nope')).toThrow(RangeError);
    expect(() => invitationDeepLink(`${TOKEN}/..`)).toThrow(RangeError);
  });

  it('reads the token from web links, deep links and bare tokens', () => {
    expect(parseInvitationLink(`https://app.transport.mx/invitacion/${TOKEN}`)).toBe(TOKEN);
    expect(parseInvitationLink(`https://app.transport.mx/invitacion/${TOKEN}/`)).toBe(TOKEN);
    expect(parseInvitationLink(`https://app.transport.mx/invitacion/${TOKEN}?utm=x#top`)).toBe(
      TOKEN,
    );
    expect(parseInvitationLink(`transport://invitacion/${TOKEN}`)).toBe(TOKEN);
    expect(parseInvitationLink(`  ${TOKEN}  `)).toBe(TOKEN);
  });

  it('returns null for anything else', () => {
    expect(parseInvitationLink(null)).toBeNull();
    expect(parseInvitationLink('')).toBeNull();
    expect(parseInvitationLink('https://app.transport.mx/invitacion/')).toBeNull();
    expect(parseInvitationLink(`https://app.transport.mx/invitacion/${TOKEN.slice(1)}`)).toBeNull();
    expect(parseInvitationLink(`https://app.transport.mx/otra/${TOKEN}`)).toBeNull();
    expect(parseInvitationLink(`transport://invite?code=${TOKEN}`)).toBeNull();
  });
});
