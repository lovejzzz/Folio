import { count } from './counts';
import { proxyMessages } from './ai';
import { proxyChat } from './openai';
import { checkout, PACKS, webhook } from './billing';
import { grantFree, MILLI, schoolEmail, statement, forgetPastGrantCounts } from './credits';
import { courseMedia, removeMedia } from './media';
import { isOwner, stats } from './stats';
import { listCourses, MAX_COURSE_BYTES, MAX_SOURCE_BYTES, readCourse, readSource, removeAccount, removeCourse, writeCourse, writeSource, type CourseMeta } from './courses';
import { SignInError, verifyIdToken } from './google';
import { missingSchemaCached } from './schemaShape';
import { clearCookie, clearNonce, endSession, newNonce, nonceCookie, nonceOf, setCookie, startSession, userOf } from './sessions';
import type { Env, User } from './types';

/**
 * Folio's API, all under /api. Nothing here is needed to use Folio: it only keeps the courses of teachers
 * who choose to sign in. Changes need the X-Folio header, which a page on another site can't send without
 * the browser asking first, and the server never says yes to that.
 */

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
const problem = (status: number, error: string, extra: Record<string, unknown> = {}) => json({ error, ...extra }, status);

const COURSE_ID = /^[A-Za-z0-9_-]{1,64}$/;

function meta(request: Request): CourseMeta | null {
  try {
    const m = JSON.parse(decodeURIComponent(request.headers.get('x-folio-meta') ?? '')) as Partial<CourseMeta>;
    if (typeof m.title !== 'string' || typeof m.lessonCount !== 'number' || typeof m.updatedAt !== 'string') return null;
    return { title: m.title.slice(0, 300), lessonCount: Math.max(0, Math.min(1000, Math.round(m.lessonCount))), updatedAt: m.updatedAt.slice(0, 40) };
  } catch {
    return null;
  }
}

/**
 * The network a caller is on. An IPv6 customer is handed a whole /64, so its first half stands for all of
 * it: counted by full address, every new account could come from a new one.
 */
export function networkOf(address: string): string {
  if (!address.includes(':')) return address;
  const [head = '', tail] = address.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = tail === undefined ? left : [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right];
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':');
}

/** The caller's network, hashed: counted for the free credits, never kept as it is. */
async function addressHash(request: Request): Promise<string> {
  const address = networkOf(request.headers.get('cf-connecting-ip') ?? 'unknown');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`folio-free:${address}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function signIn(request: Request, env: Env, fetchImpl?: typeof fetch): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { idToken?: unknown } | null;
  if (typeof body?.idToken !== 'string') return problem(400, 'bad-request');
  // Only the nonce this browser was given: one sent along in the body would be whatever the token says.
  const nonce = nonceOf(request);
  if (!nonce) return problem(401, 'sign-in-failed', { detail: 'This sign-in ran out of time.' });
  try {
    const who = await verifyIdToken(body.idToken, { clientId: env.VITE_GOOGLE_CLIENT_ID, nonce, fetchImpl });
    const user: User = { id: who.sub, email: who.email, name: who.name };
    const token = await startSession(env.DB, user);
    // A school account's first sign-in brings the free credits, within the limits that keep them from being farmed.
    // A grant that fails (the same account signing in twice at once) never fails the sign-in: the other one made it.
    const granted = schoolEmail(who.email, who.emailVerified) ? await grantFree(env.DB, user.id, await addressHash(request)).catch(() => 0) : 0;
    await count(env.DB, 'sign_in');
    if (granted) await count(env.DB, 'free_credits_granted');
    await forgetPastGrantCounts(env.DB).catch(() => undefined);
    const res = json({ user });
    res.headers.append('set-cookie', setCookie(token));
    // Used once: the same token can't start a second session.
    res.headers.append('set-cookie', clearNonce());
    return res;
  } catch (error) {
    if (error instanceof SignInError) return problem(401, 'sign-in-failed', { detail: error.message });
    throw error;
  }
}

/** The texts a body refers to, as the page lists them; null from an older page that sends no list. */
function sourcesOf(request: Request): string[] | null {
  const header = request.headers.get('x-folio-sources');
  if (header === null) return null;
  return header.split(',').map((s) => s.trim()).filter((s) => COURSE_ID.test(s));
}

/** One attached file's text for a course: sent once, fetched by a device that doesn't have it. */
async function courseSource(request: Request, env: Env, user: User, id: string, sourceId: string): Promise<Response> {
  if (!COURSE_ID.test(id) || !COURSE_ID.test(sourceId)) return problem(400, 'bad-course-id');
  if (request.method === 'GET') {
    const data = await readSource(env.DB, user.id, id, sourceId);
    if (!data) return problem(404, 'not-found');
    return new Response(data, { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' } });
  }
  if (request.method === 'PUT') {
    const data = new Uint8Array(await request.arrayBuffer());
    if (data.length === 0 || data.length > MAX_SOURCE_BYTES) return problem(413, 'too-large');
    await writeSource(env.DB, user.id, id, sourceId, data);
    return json({ ok: true });
  }
  return problem(405, 'method');
}

async function course(request: Request, env: Env, user: User, id: string): Promise<Response> {
  if (!COURSE_ID.test(id)) return problem(400, 'bad-course-id');
  if (request.method === 'GET') {
    const found = await readCourse(env.DB, user.id, id);
    if (!found) return problem(404, 'not-found');
    return new Response(found.data, { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store', 'x-folio-version': String(found.version) } });
  }
  if (request.method === 'PUT') {
    const base = Number(request.headers.get('if-match') ?? 'NaN');
    const m = meta(request);
    if (!Number.isInteger(base) || base < 0 || !m) return problem(400, 'bad-request');
    const data = new Uint8Array(await request.arrayBuffer());
    if (data.length === 0 || data.length > MAX_COURSE_BYTES) return problem(413, 'too-large');
    const result = await writeCourse(env.DB, user.id, id, base, m, data, sourcesOf(request));
    if ('missing' in result) return problem(422, 'sources-missing', { missing: result.missing });
    if (result.ok) {
      await count(env.DB, 'course_saved');
      return json({ version: result.version });
    }
    if ('full' in result) {
      await count(env.DB, 'account_full');
      return problem(507, 'account-full');
    }
    return problem(409, 'conflict', { version: result.version, deleted: result.deleted });
  }
  if (request.method === 'DELETE') {
    await removeCourse(env.DB, user.id, id);
    await removeMedia(env.MEDIA, user.id, id);
    return json({ ok: true });
  }
  return problem(405, 'method');
}

/** The balance, in credits, with what was added lately and what was spent in the last 30 days. */
async function credits(env: Env, user: User): Promise<Response> {
  const s = await statement(env.DB, user.id);
  const c = (milli: number) => Math.floor(milli / MILLI);
  return json({
    available: Boolean(env.ANTHROPIC_API_KEY),
    // What can be bought, once Stripe is set up.
    packs: env.STRIPE_SECRET_KEY ? PACKS : [],
    balance: c(s.balance),
    // Whether the free credits come with this address (Google confirmed it at sign-in), so the page can say why not.
    school: schoolEmail(user.email, true),
    spent30: c(s.spent30),
    added: s.added.map((r) => ({ kind: r.kind, credits: c(r.amount), detail: r.detail, at: new Date(r.created_at).toISOString() })),
  });
}

/**
 * Route one request under /api. `fetchImpl` reaches Google's keys and Anthropic (tests pass their own);
 * `waitUntil` keeps work going after the answer is sent, as settling a streamed call does.
 */
export async function handle(request: Request, env: Env, fetchImpl?: typeof fetch, waitUntil: (p: Promise<unknown>) => void = () => {}): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  // Stripe's own call, trusted by its signature, not by a cookie or the page's header.
  if (path.join('/') === 'billing/webhook' && request.method === 'POST') return webhook(request, env);
  // Whether production's database has every table and column the code uses: checked after each deploy.
  if (path.join('/') === 'health' && request.method === 'GET') {
    const missing = await missingSchemaCached(env.DB);
    return json(missing.length ? { ok: false, missing } : { ok: true }, missing.length ? 503 : 200);
  }
  const changing = request.method !== 'GET' && request.method !== 'HEAD';
  if (changing && request.headers.get('x-folio') !== '1') return problem(403, 'forbidden');
  if (path[0] === 'session') {
    if (path[1] === 'nonce' && request.method === 'POST') {
      const nonce = newNonce();
      return json({ nonce }, 200, { 'set-cookie': nonceCookie(nonce) });
    }
    if (request.method === 'POST') return signIn(request, env, fetchImpl);
    if (request.method === 'DELETE') {
      await endSession(env.DB, request);
      return json({ ok: true }, 200, { 'set-cookie': clearCookie() });
    }
    if (request.method === 'GET') return json({ user: await userOf(env.DB, request) });
    return problem(405, 'method');
  }
  const user = await userOf(env.DB, request);
  if (!user) return problem(401, 'signed-out');
  if (path[0] === 'courses' && path.length === 1 && request.method === 'GET') return json({ courses: await listCourses(env.DB, user.id) });
  if (path[0] === 'credits' && path.length === 1 && request.method === 'GET') return credits(env, user);
  // The running totals, for the account that runs Folio; to anyone else there is no such page.
  if (path.join('/') === 'admin/stats' && request.method === 'GET') return (await isOwner(user)) ? json(await stats(env)) : problem(404, 'not-found');
  if (path.join('/') === 'billing/checkout' && request.method === 'POST') return checkout(request, env, user, fetchImpl);
  // Anthropic's Messages API, as the page's SDK calls it with Folio credits ("…/api/ai/v1/messages?beta=true").
  if (path.join('/') === 'ai/v1/messages' && request.method === 'POST') return proxyMessages(request, env, user, waitUntil, fetchImpl);
  // OpenAI's chat completions, as the page's OpenAI adapter calls them with Folio credits.
  if (path.join('/') === 'ai/openai/v1/chat/completions' && request.method === 'POST') return proxyChat(request, env, user, waitUntil, fetchImpl);
  if (path[0] === 'courses' && path.length === 2) return course(request, env, user, path[1]!);
  if (path[0] === 'courses' && path.length === 4 && path[2] === 'sources') return courseSource(request, env, user, path[1]!, path[3]!);
  if (path[0] === 'courses' && (path.length === 3 || path.length === 4) && path[2] === 'media') return COURSE_ID.test(path[1]!) ? courseMedia(request, env, user, path[1]!, path[3]) : problem(400, 'bad-course-id');
  if (path[0] === 'account' && path.length === 1 && request.method === 'DELETE') {
    await removeMedia(env.MEDIA, user.id);
    await removeAccount(env.DB, user.id);
    return json({ ok: true }, 200, { 'set-cookie': clearCookie() });
  }
  return problem(404, 'not-found');
}
