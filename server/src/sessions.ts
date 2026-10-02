import type { D1Database, User } from './types';

/**
 * A signed-in browser holds a random session cookie: HttpOnly, so page scripts can't read it; Secure; sent
 * only to /api and only with same-site requests. The database keeps its hash, never the cookie itself.
 */

const COOKIE = 'folio_session';
const DAYS = 90;

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const hash = async (token: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));

function newToken(): string {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function cookieOf(request: Request, name = COOKIE): string | null {
  const header = request.headers.get('cookie') ?? '';
  const match = header.split(/;\s*/).find((c) => c.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) || null : null;
}

export const setCookie = (token: string) => `${COOKIE}=${token}; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=${DAYS * 86400}`;
export const clearCookie = () => `${COOKIE}=; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

/**
 * The nonce a sign-in must carry, made here and held in this browser's cookie for ten minutes. Google writes it
 * into the ID token, and the token is taken only with the cookie: one copied from somewhere else, nonce and all,
 * can't be used to sign in from another browser.
 */
const NONCE = 'folio_signin';
export const newNonce = () => newToken();
export const nonceCookie = (nonce: string) => `${NONCE}=${nonce}; Path=/api/session; HttpOnly; Secure; SameSite=Lax; Max-Age=600`;
export const clearNonce = () => `${NONCE}=; Path=/api/session; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
export const nonceOf = (request: Request) => cookieOf(request, NONCE);

/** Start a session for a user who just signed in; returns the cookie value. */
export async function startSession(db: D1Database, user: User, now = Date.now()): Promise<string> {
  const token = newToken();
  await db.batch([
    db
      .prepare('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name')
      .bind(user.id, user.email, user.name, now),
    db.prepare('INSERT INTO sessions (id_hash, user_id, expires_at) VALUES (?, ?, ?)').bind(await hash(token), user.id, now + DAYS * 86400 * 1000),
    // Old sessions go when they have run out, whichever browser they were.
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at < ?').bind(user.id, now),
  ]);
  return token;
}

/** The signed-in user, or null. */
export async function userOf(db: D1Database, request: Request, now = Date.now()): Promise<User | null> {
  const token = cookieOf(request);
  if (!token) return null;
  return db
    .prepare('SELECT users.id AS id, users.email AS email, users.name AS name FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.id_hash = ? AND sessions.expires_at > ?')
    .bind(await hash(token), now)
    .first<User>();
}

export async function endSession(db: D1Database, request: Request): Promise<void> {
  const token = cookieOf(request);
  if (token) await db.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(await hash(token)).run();
}
