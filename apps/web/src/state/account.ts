import { create } from 'zustand';

/**
 * Signing in is optional: it keeps the courses in the teacher's account, so they are there on any device.
 * A browser that has never signed in never calls Folio's server. This module is on the first-load path, so
 * the syncing itself is loaded only once someone is signed in.
 */

export interface AccountUser {
  id: string;
  email: string;
  name: string;
}

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error';

interface AccountState {
  user: AccountUser | null;
  sync: SyncState;
  /** When this device last matched the account, as ms since the epoch. */
  lastSynced: number | null;
  /** Courses already on this device when the teacher signed in, waiting for them to say which to add. */
  offer: string[];
}

export const useAccount = create<AccountState>(() => ({ user: null, sync: 'idle', lastSynced: null, offer: [] }));

const HINT = 'folio.account';
export const SIGN_IN_WINDOW = 'folio-sign-in';
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('folio.account');

export function readHint(): AccountUser | null {
  try {
    const saved = JSON.parse(localStorage.getItem(HINT) ?? 'null') as AccountUser | null;
    return saved && typeof saved.id === 'string' && typeof saved.email === 'string' ? saved : null;
  } catch {
    return null;
  }
}

export function writeHint(user: AccountUser | null): void {
  try {
    if (user) localStorage.setItem(HINT, JSON.stringify(user));
    else localStorage.removeItem(HINT);
  } catch {
    // Without storage the page forgets it was signed in; the session cookie still holds.
  }
}

const sync = () => import('./sync');

/** Tell the other tabs (and the window that asked for a sign-in). */
export function announce(message: { type: 'signed-in'; user: AccountUser } | { type: 'signed-out' }): void {
  channel?.postMessage(message);
}

let started = false;

/** At startup: if this browser is signed in, catch up with the account. */
export function startAccount(): void {
  if (started) return;
  started = true;
  const user = readHint();
  if (user) {
    useAccount.setState({ user });
    void sync().then((m) => m.start(user, { justSignedIn: takeJustSignedIn() }));
  }
  channel?.addEventListener('message', (e: MessageEvent<{ type: string; user?: AccountUser }>) => {
    if (e.data.type === 'signed-in' && e.data.user) {
      useAccount.setState({ user: e.data.user });
      void sync().then((m) => m.start(e.data.user!, { justSignedIn: true }));
    } else if (e.data.type === 'signed-out') {
      void sync().then((m) => m.forgetHere());
    }
  });
}

const JUST = 'folio.justSignedIn';
export function markJustSignedIn(): void {
  try {
    sessionStorage.setItem(JUST, '1');
  } catch {
    // Harmless: the offer to add this device's courses comes at the next sign-in instead.
  }
}
function takeJustSignedIn(): boolean {
  try {
    const was = sessionStorage.getItem(JUST) === '1';
    sessionStorage.removeItem(JUST);
    return was;
  } catch {
    return false;
  }
}

/**
 * Sign in with Google, in a small window so the page stays as it is; where pop-ups are blocked, in this tab,
 * coming back to where the teacher was.
 */
export function signIn(): void {
  const w = 520;
  const h = 640;
  const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
  const top = Math.round(window.screenY + (window.outerHeight - h) / 3);
  const popup = window.open('/sign-in', SIGN_IN_WINDOW, `popup,width=${w},height=${h},left=${left},top=${top}`);
  if (!popup) window.location.assign(`/sign-in?return=${encodeURIComponent(window.location.pathname + window.location.search)}`);
}

export async function signOut(): Promise<void> {
  await (await sync()).signOut();
}

export async function deleteAccount(): Promise<void> {
  await (await sync()).deleteAccount();
}
