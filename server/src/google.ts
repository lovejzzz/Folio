/**
 * Who signed in, from the ID token Google gave the page. The token is checked here, against Google's
 * published keys, so the page's word is never taken for who someone is. No client secret is involved.
 */

const KEYS = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

export class SignInError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignInError';
  }
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
}

interface Jwk extends JsonWebKey {
  kid?: string;
}

let cache: { at: number; keys: Jwk[] } | null = null;

async function googleKeys(fetchImpl: typeof fetch, fresh = false): Promise<Jwk[]> {
  if (!fresh && cache && Date.now() - cache.at < 60 * 60 * 1000) return cache.keys;
  const response = await fetchImpl(KEYS);
  if (!response.ok) throw new SignInError('Google’s keys could not be read.');
  const { keys } = (await response.json()) as { keys: Jwk[] };
  cache = { at: Date.now(), keys };
  return keys;
}

const bytes = (b64url: string): Uint8Array<ArrayBuffer> => {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=');
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};
const json = (part: string): Record<string, unknown> => JSON.parse(new TextDecoder().decode(bytes(part))) as Record<string, unknown>;

/** Verify an ID token: Google signed it, for this app, recently, for this sign-in (the nonce), with an email. */
export async function verifyIdToken(
  token: string,
  options: { clientId: string; nonce: string; now?: number; fetchImpl?: typeof fetch },
): Promise<GoogleIdentity> {
  const { clientId, nonce, now = Date.now(), fetchImpl = fetch } = options;
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) throw new SignInError('Not an ID token.');
  let header: Record<string, unknown>, claims: Record<string, unknown>, signature: Uint8Array<ArrayBuffer>;
  try {
    header = json(h);
    claims = json(p);
    signature = bytes(s);
  } catch {
    throw new SignInError('Not an ID token.');
  }
  if (header.alg !== 'RS256') throw new SignInError('Unexpected signature.');
  let jwk = (await googleKeys(fetchImpl)).find((k) => k.kid === header.kid);
  // Google rotates its keys: an unknown one means ours are old.
  jwk ??= (await googleKeys(fetchImpl, true)).find((k) => k.kid === header.kid);
  if (!jwk) throw new SignInError('Unknown signing key.');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const signed = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, new TextEncoder().encode(`${h}.${p}`));
  if (!signed) throw new SignInError('The signature does not match.');
  if (!ISSUERS.has(String(claims.iss))) throw new SignInError('Not issued by Google.');
  if (claims.aud !== clientId) throw new SignInError('Issued for another app.');
  if (typeof claims.exp !== 'number' || claims.exp * 1000 < now) throw new SignInError('The sign-in has expired.');
  if (typeof claims.iat === 'number' && claims.iat * 1000 > now + 5 * 60 * 1000) throw new SignInError('Issued in the future.');
  if (!nonce || claims.nonce !== nonce) throw new SignInError('Not this sign-in.');
  if (typeof claims.sub !== 'string' || typeof claims.email !== 'string') throw new SignInError('No account in the token.');
  return { sub: claims.sub, email: claims.email, name: typeof claims.name === 'string' ? claims.name : '' };
}

/** For tests: forget the cached keys. */
export function forgetGoogleKeys(): void {
  cache = null;
}
