import { SIGN_IN_PATH } from './googlePath';

/**
 * Signing in with Google: the page goes to Google and comes back with an ID token saying who signed in, for
 * Folio's server to check. Only the basic profile is asked for (name and email), never access to anything.
 */

const PENDING = 'folio.signIn';

interface Pending {
  state: string;
  nonce: string;
  returnTo: string;
  /** Started in the small sign-in window. Kept here, as a browser clears a window's name on the way to Google. */
  popup: boolean;
}

/** Remember this sign-in in this tab, and return where to send the teacher. */
export function startSignIn(clientId: string, origin: string, returnTo: string, popup: boolean): string {
  const pending: Pending = { state: crypto.randomUUID(), nonce: crypto.randomUUID(), returnTo: returnTo.startsWith('/') ? returnTo : '/', popup };
  sessionStorage.setItem(PENDING, JSON.stringify(pending));
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}${SIGN_IN_PATH}`,
    response_type: 'id_token',
    scope: 'openid email profile',
    prompt: 'select_account',
    state: pending.state,
    nonce: pending.nonce,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${query.toString()}`;
}

export type SignInReply = { idToken: string; nonce: string; returnTo: string; popup: boolean } | { error: 'cancelled' | 'failed'; returnTo: string; popup: boolean };

/** Google's reply in the address, if there is one. A reply to a sign-in this tab didn't start is refused. */
export function finishSignIn(hash: string): SignInReply | null {
  const reply = new URLSearchParams(hash.replace(/^#/, ''));
  if (!reply.has('id_token') && !reply.has('error')) return null;
  const saved = sessionStorage.getItem(PENDING);
  sessionStorage.removeItem(PENDING);
  const pending = saved ? (JSON.parse(saved) as Pending) : null;
  if (!pending || reply.get('state') !== pending.state) return { error: 'failed', returnTo: '/', popup: pending?.popup ?? false };
  const idToken = reply.get('id_token');
  if (!idToken) return { error: reply.get('error') === 'access_denied' ? 'cancelled' : 'failed', returnTo: pending.returnTo, popup: pending.popup };
  return { idToken, nonce: pending.nonce, returnTo: pending.returnTo, popup: pending.popup };
}
