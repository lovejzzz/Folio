import { accountText } from './accountText';
import { newId, type Course } from '@folio/core';
import { currentMessages } from '../i18n';
import { announce, useAccount, writeHint, type AccountUser, type SyncState } from './account';
import { db, deleteCourse, loadCourse, loadCourseWithHistory, onCourseWrite, saveCourse, textsOf, versionOf, type SyncRow } from './db';
import { forSending, sendTexts, wholeCopy } from './syncTexts';
import { sendMedia } from './mediaSync';
import type { HistoryRow } from './historySync';
import { activeStore, dropSession, flushNow } from './session';
import { toast } from './toasts';

/**
 * Keeps the signed-in account's courses and this device's copies the same. This device's IndexedDB stays the
 * working copy: a save here is sent to the account a moment later, and the account's changes from other
 * devices are fetched when the page opens or comes back into view. A write names the account version it
 * replaces; when another device got there first, both versions are kept, never one silently lost.
 */

interface Listed {
  id: string;
  version: number;
  deleted: boolean;
}

let user: AccountUser | null = null;
let unsubscribe: (() => void) | null = null;
const courses = new BroadcastChannel('folio.courses');

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.method && init.method !== 'GET') headers.set('x-folio', '1');
  return fetch(`/api/${path}`, { ...init, headers, credentials: 'same-origin' });
}

async function gzip(text: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
}
async function gunzip(bytes: ArrayBuffer): Promise<string> {
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}

let busy = 0;
/** Whether any task failed since the last time nothing was under way: a send that failed inside a pull that didn't. */
let faltered = false;
const set = (sync: SyncState) => useAccount.setState({ sync, ...(sync === 'idle' ? { lastSynced: Date.now() } : {}) });
async function working<T>(task: () => Promise<T>): Promise<T | undefined> {
  busy += 1;
  set('syncing');
  let ok = false;
  try {
    const result = await task();
    ok = true;
    return result;
  } catch {
    return undefined;
  } finally {
    busy -= 1;
    faltered ||= !ok;
    if (!busy) {
      set(faltered ? (navigator.onLine ? 'error' : 'offline') : 'idle');
      faltered = false;
    }
  }
}

const linked = async (id: string): Promise<SyncRow | undefined> => {
  const row = await db.sync.get(id);
  return row && user && row.account === user.id && row.state === 'linked' ? row : undefined;
};

/** The session ended somewhere else (it ran out, or the account was signed out elsewhere): ask to sign in again. */
function signedOutElsewhere(): void {
  user = null;
  writeHint(null);
  useAccount.setState({ user: null, sync: 'idle', offer: [] });
  toast({ key: 'account', message: accountText.sessionEnded, duration: 0 });
}

async function check(res: Response): Promise<Response> {
  if (res.status === 401) {
    signedOutElsewhere();
    throw new Error('signed out');
  }
  // 409: changed elsewhere; 404: gone; 422: a text the account lacks. Each is answered where it is asked.
  if (!res.ok && res.status !== 409 && res.status !== 404 && res.status !== 422) throw new Error(`HTTP ${res.status}`);
  return res;
}

/**
 * One tab at a time talks to the account about its courses. The tabs of a browser share this device's copies:
 * without this, two of them send the same change and the slower is told another device got there first.
 */
function alone<T>(task: () => Promise<T>): Promise<T> {
  return typeof navigator !== 'undefined' && navigator.locks ? (navigator.locks.request('folio.sync', task) as Promise<T>) : task();
}

interface AccountCopy {
  version: number;
  course: Course;
  history: HistoryRow[];
  /** The file texts the account holds for it. */
  held: string[];
}

/** The account's copy of a course, or null when the account no longer has it. */
async function fetchCopy(id: string): Promise<AccountCopy | null> {
  const res = await check(await api(`courses/${id}`));
  if (res.status === 404) return null;
  const version = Number(res.headers.get('x-folio-version'));
  const payload = JSON.parse(await gunzip(await res.arrayBuffer())) as { course: Course; history: HistoryRow[] };
  const whole = await wholeCopy(payload, await textsOf(id), async (sourceId) => {
    const text = await check(await api(`courses/${id}/sources/${sourceId}`));
    if (text.status === 404) throw new Error('A file of this course is missing from the account.');
    return gunzip(await text.arrayBuffer());
  });
  return { version, ...whole };
}

/** The account's copy replaces this device's. An open tab follows, or asks if it has unsaved work. */
async function adopt(id: string, copy: AccountCopy): Promise<void> {
  if (!user) return;
  // Recorded before the save, so the save is known to match the account and isn't sent back.
  await db.sync.put({ id, account: user.id, state: 'linked', version: copy.version, synced: versionOf(copy.course), sent: copy.held });
  await saveCourse(copy.course, { courseId: id, replace: true, put: copy.history, remove: [] });
  courses.postMessage({ id, version: versionOf(copy.course) });
}

async function download(id: string): Promise<void> {
  const copy = await fetchCopy(id);
  if (copy) await adopt(id, copy);
}

/**
 * The account's copy isn't the one this device last had. Changed on another device: this device's version
 * becomes a copy, and the account's is kept. Deleted there: the copy is all that stays. But when the account
 * holds this very version (another tab sent it, or the answer to our own send was lost), nothing was changed
 * elsewhere, and the two are only matched up again.
 */
async function keepBoth(id: string, local: Course): Promise<void> {
  const t = accountText;
  const theirs = await fetchCopy(id);
  if (!user) return;
  if (theirs && versionOf(theirs.course) === versionOf(local)) {
    await db.sync.put({ id, account: user.id, state: 'linked', version: theirs.version, synced: versionOf(local) });
    return;
  }
  const title = local.title || currentMessages().common.untitled;
  await saveCourse({ ...local, id: newId('c'), title: t.copyTitle(title) });
  if (theirs) await adopt(id, theirs);
  else await forget(id);
  toast({ key: `both-${id}`, message: theirs ? t.keptBoth(title) : t.keptDeleted(title), duration: 0 });
}

function pushOne(id: string): Promise<void> {
  return alone(async () => {
    const row = await linked(id);
    const loaded = row ? await loadCourseWithHistory(id) : null;
    if (!row || !loaded || versionOf(loaded.course) === row.synced) return;
    const { course, history } = loaded;
    const sending = forSending(course, history);
    const sendText = async (sourceId: string, text: string) => void (await check(await api(`courses/${id}/sources/${sourceId}`, { method: 'PUT', body: await gzip(text) })));
    await sendTexts(sending, row.sent ?? [], sendText);
    const meta = { title: course.title, lessonCount: course.lessonOrder.length, updatedAt: course.updatedAt };
    const body = await gzip(JSON.stringify(sending.payload));
    const put = async () =>
      check(await api(`courses/${id}`, { method: 'PUT', body, headers: { 'if-match': String(row.version), 'x-folio-meta': encodeURIComponent(JSON.stringify(meta)), 'x-folio-sources': sending.needed.join(',') } }));
    let res = await put();
    // The account lost a text this device thought it had sent (another device's write, say): send it, and again.
    if (res.status === 422) {
      const { missing } = (await res.json()) as { missing: string[] };
      for (const sourceId of missing) await sendText(sourceId, sending.texts[sourceId]!);
      res = await put();
      if (res.status === 422) throw new Error('The account would not take this course’s files.');
    }
    if (res.status === 409) return keepBoth(id, course);
    const { version } = (await res.json()) as { version: number };
    await db.sync.put({ ...row, version, synced: versionOf(course), sent: sending.needed });
    // After the course, and never in its way: what its pages name is sent once each.
    await sendMedia(course).catch(() => undefined);
  });
}

const queue = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;
let pushing: Promise<unknown> = Promise.resolve();

function schedule(id: string): void {
  queue.add(id);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void pushQueued(), 1200);
}

/**
 * A send that failed is tried again, each time after longer, as well as at the next pull. Only a failure that
 * may pass by itself (the connection, the server busy) is: an account that is full, or a course it refuses, would
 * be gzipped and sent again every minute for nothing.
 */
const RETRY = [60_000, 120_000, 300_000, 900_000];
let retries = 0;

/** A refusal that sending the same thing again won't change: the account full (507), or any 4xx but "too many requests" and "timed out". */
export const refusedForGood = (error: unknown): boolean => {
  const status = Number(/^HTTP (\d{3})$/.exec(error instanceof Error ? error.message : '')?.[1]);
  return (status >= 400 && status < 500 && status !== 429 && status !== 408) || status === 507;
};

function pushQueued(): Promise<unknown> {
  if (timer) clearTimeout(timer);
  timer = null;
  const ids = [...queue];
  queue.clear();
  pushing = pushing.then(async () => {
    const failed: string[] = [];
    let again = false;
    await working(async () => {
      let first: unknown;
      // Each course on its own: one the account refuses doesn't hold back the rest.
      for (const id of ids) {
        try {
          await pushOne(id);
        } catch (error) {
          if (!user) throw error;
          failed.push(id);
          again ||= !refusedForGood(error);
          first ??= error;
        }
      }
      if (first) throw first;
    });
    if (!failed.length) retries = 0;
    if (!failed.length || !user) return;
    // Kept for the next pull or sign-out check either way; the timer only for what may pass, and not offline,
    // where coming back online pulls.
    for (const id of failed) queue.add(id);
    if (again && navigator.onLine !== false) timer ??= setTimeout(() => void pushQueued(), RETRY[Math.min(retries++, RETRY.length - 1)]);
  });
  return pushing;
}

async function onWrite(write: { type: string; id: string }): Promise<void> {
  if (!user) return;
  const row = await db.sync.get(write.id);
  if (write.type === 'saved') {
    // A course made here while signed in belongs to the account.
    if (!row) await db.sync.put({ id: write.id, account: user.id, state: 'linked', version: 0, synced: '' });
    else if (row.account !== user.id || row.state !== 'linked') return;
    schedule(write.id);
  } else if (write.type === 'deleted') {
    if (row?.account === user.id && row.state === 'linked') await working(async () => void (await check(await api(`courses/${write.id}`, { method: 'DELETE' }))));
    await db.sync.delete(write.id);
  }
}

/** Remove this device's copy of an account course (signing out, or deleted on another device). */
async function forget(id: string): Promise<void> {
  const open = activeStore()?.getState().id === id;
  if (open) dropSession(id);
  await deleteCourse(id, { forget: true });
  await db.sync.delete(id);
  // Only once the copy is gone: a page that leaves first can leave it behind, to be found again as a change.
  if (open) window.location.assign('/');
}

async function applyListed(s: Listed): Promise<void> {
  const row = await linked(s.id);
  const local = await loadCourse(s.id);
  if (s.deleted) {
    if (row && (!local || versionOf(local) === row.synced)) await forget(s.id);
    return;
  }
  if (!row) {
    if (!local) await download(s.id);
    return;
  }
  // Known here but missing (cleared from this browser): fetch it again.
  if (!local) return download(s.id);
  if (s.version <= row.version) return;
  if (versionOf(local) !== row.synced) await keepBoth(s.id, local);
  else await download(s.id);
}

/** Fetch what changed in the account since this device last looked, then send what changed here. */
export function pull(): Promise<unknown> {
  return working(async () => {
    if (!user) return;
    // Listed and applied with no send under way in any tab: a send half done reads as a change made elsewhere.
    await alone(async () => {
      const res = await check(await api('courses'));
      const { courses: listed } = (await res.json()) as { courses: Listed[] };
      for (const s of listed) await applyListed(s);
    });
    if (!user) return;
    for (const row of await db.sync.where('account').equals(user.id).toArray()) if (row.state === 'linked') queue.add(row.id);
    await pushQueued();
  });
}

let lastPull = 0;
function pullSoon(): void {
  if (!user || Date.now() - lastPull < 20_000) return;
  lastPull = Date.now();
  void pull();
}

/** Courses already here when the teacher signed in: they choose which go into the account. */
async function offerLocalCourses(): Promise<void> {
  if (!user) return;
  const account = user.id;
  const ids: string[] = [];
  for (const id of await db.summaries.toCollection().primaryKeys()) {
    const row = await db.sync.get(id);
    if (row?.account === account && row.state !== 'ask') continue;
    await db.sync.put({ id, account, state: 'ask', version: 0, synced: '' });
    ids.push(id);
  }
  useAccount.setState({ offer: ids });
}

/** The teacher's answer: `add` go into the account; the rest stay only on this device. */
export async function answerOffer(add: string[]): Promise<void> {
  if (!user) return;
  for (const id of useAccount.getState().offer) {
    const row = await db.sync.get(id);
    if (!row) continue;
    await db.sync.put({ ...row, state: add.includes(id) ? 'linked' : 'declined' });
    if (add.includes(id)) queue.add(id);
  }
  useAccount.setState({ offer: [] });
  await pushQueued();
}

let listening = false;
export async function start(signedIn: AccountUser, { justSignedIn = false } = {}): Promise<void> {
  user = signedIn;
  useAccount.setState({ user: signedIn });
  unsubscribe ??= onCourseWrite((w) => void onWrite(w));
  if (!listening) {
    listening = true;
    window.addEventListener('focus', pullSoon);
    window.addEventListener('online', () => void pull());
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && pullSoon());
  }
  const res = await api('session').catch(() => null);
  if (res?.ok) {
    const { user: current } = (await res.json()) as { user: AccountUser | null };
    if (current?.id !== signedIn.id) return signedOutElsewhere();
  }
  if (justSignedIn) await offerLocalCourses();
  lastPull = Date.now();
  await pull();
}

/** Courses in the account whose latest changes on this device haven't reached it. */
export async function unsent(): Promise<number> {
  if (!user) return 0;
  await flushNow();
  await pushQueued();
  let n = 0;
  for (const row of await db.sync.where('account').equals(user.id).toArray()) {
    const local = row.state === 'linked' ? await loadCourse(row.id) : null;
    if (local && versionOf(local) !== row.synced) n += 1;
  }
  return n;
}

/** This device forgets the account and its courses; they stay in the account. */
export async function forgetHere(): Promise<void> {
  const account = user?.id;
  user = null;
  // Nothing more is sent for an account this device has left.
  queue.clear();
  if (timer) clearTimeout(timer);
  timer = null;
  unsubscribe?.();
  unsubscribe = null;
  writeHint(null);
  if (account) {
    for (const row of await db.sync.where('account').equals(account).toArray()) {
      if (row.state === 'linked') await forget(row.id);
      else await db.sync.delete(row.id);
    }
  }
  useAccount.setState({ user: null, sync: 'idle', lastSynced: null, offer: [] });
}

export async function signOut(): Promise<void> {
  await api('session', { method: 'DELETE' }).catch(() => null);
  await forgetHere();
  announce({ type: 'signed-out' });
}

export async function deleteAccount(): Promise<void> {
  const res = await api('account', { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  await forgetHere();
  announce({ type: 'signed-out' });
}
