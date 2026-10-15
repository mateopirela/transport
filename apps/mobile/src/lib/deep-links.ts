// Parsing of the links that open the app:
//   transport://auth/callback?code=…   e-mail confirmation (PKCE)
//   transport://invite?code=…          operator invitation (D15)

export type AuthRedirect =
  { kind: 'code'; code: string } | { kind: 'error'; errorCode: string | null } | { kind: 'none' };

function paramsOf(url: string): URLSearchParams {
  const params = new URLSearchParams();
  const hashIndex = url.indexOf('#');
  const beforeHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const queryIndex = beforeHash.indexOf('?');
  if (queryIndex !== -1) {
    new URLSearchParams(beforeHash.slice(queryIndex + 1)).forEach((v, k) => params.append(k, v));
  }
  if (hashIndex !== -1) {
    new URLSearchParams(url.slice(hashIndex + 1)).forEach((v, k) => params.append(k, v));
  }
  return params;
}

/**
 * Reads the result of an Auth redirect. Only a PKCE `code` is accepted: it is
 * useless without the verifier stored on this device, so a link crafted by
 * someone else cannot sign the user into another account. Tokens in the URL
 * fragment (implicit flow) are deliberately ignored.
 */
export function parseAuthRedirect(url: string | null | undefined): AuthRedirect {
  if (!url) return { kind: 'none' };
  const params = paramsOf(url);
  const error = params.get('error') ?? params.get('error_code');
  if (error) return { kind: 'error', errorCode: params.get('error_code') ?? error };
  const code = params.get('code');
  if (code && /^[A-Za-z0-9-]{8,128}$/u.test(code)) return { kind: 'code', code };
  return { kind: 'none' };
}

/** `code` route param of the invitation link, as a string (or empty). */
export function invitationCodeParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? '').trim().slice(0, 64);
}
