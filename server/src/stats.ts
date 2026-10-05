import { MILLI } from './credits';
import type { Env, User } from './types';

/**
 * How Folio is doing, for the person who runs it: totals only, as the privacy page says Folio keeps them. No
 * course, name or address is in any of it. Asked for by one account alone, known here by the hash of its address,
 * so the address itself is in no file.
 */
const OWNERS = new Set(['3635e3c9129ffc4551cd2ec6968d959d291c882f7f11ada5e93774c4d1518c2f']);

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const isOwner = async (user: User): Promise<boolean> => OWNERS.has(await sha256(user.email.trim().toLowerCase()));

const DAY = 24 * 60 * 60 * 1000;

export interface Stats {
  at: string;
  accounts: { all: number; week: number; month: number; school: number; withCourses: number; writing30: number; paying: number };
  courses: { kept: number; bytes: number; lessons: number; changed7: number; changed30: number; short: number; medium: number; long: number; mostInOneAccount: number };
  credits: { held: number; outstanding: number; spent30: number; spentMonth: number; bought30: number; granted30: number; purchases30: number; dollars30: number };
  /** Each model's calls and credits over 30 days, dearest first. */
  models: { model: string; calls: number; credits: number }[];
  /** What the busiest accounts spent in 30 days, largest first: amounts only, no account named. */
  heaviest: number[];
  calls: { made30: number; refused30: number; unreachable30: number; ranOut30: number };
  media: { files: number; bytes: number; pictures: number; clips: number; other: number } | null;
  /** The last 30 days, newest first: each day's counts by name, with that day's new accounts. */
  days: { day: string; counts: Record<string, number> }[];
}

const PICTURE = /\.(png|jpe?g|webp|gif)$/i;
const CLIP = /\.(mp4|m4v|webm|mov)$/i;

async function mediaTotals(env: Env): Promise<Stats['media']> {
  if (!env.MEDIA) return null;
  const total = { files: 0, bytes: 0, pictures: 0, clips: 0, other: 0 };
  let cursor: string | undefined;
  do {
    const page = await env.MEDIA.list({ prefix: '', cursor });
    for (const o of page.objects) {
      // The Python runtime is kept in the same bucket and is nobody's media.
      if (o.key.startsWith('_runtime/')) continue;
      total.files += 1;
      total.bytes += o.size;
      total[PICTURE.test(o.key) ? 'pictures' : CLIP.test(o.key) ? 'clips' : 'other'] += 1;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return total;
}

type One = (sql: string, ...values: unknown[]) => Promise<number>;
const whole = (milli: number) => Math.round(Math.abs(milli) / MILLI);

async function accounts(one: One, now: number): Promise<Stats['accounts']> {
  return {
    all: await one('SELECT COUNT(*) AS n FROM users'),
    week: await one('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?', now - 7 * DAY),
    month: await one('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?', now - 30 * DAY),
    school: await one("SELECT COUNT(*) AS n FROM users WHERE lower(email) LIKE '%.edu'"),
    withCourses: await one('SELECT COUNT(DISTINCT user_id) AS n FROM courses WHERE deleted = 0'),
    writing30: await one("SELECT COUNT(DISTINCT user_id) AS n FROM credit_ledger WHERE kind = 'spend' AND created_at >= ?", now - 30 * DAY),
    paying: await one("SELECT COUNT(DISTINCT user_id) AS n FROM credit_ledger WHERE kind = 'purchase'"),
  };
}

async function courses(one: One, now: number): Promise<Stats['courses']> {
  const since = (days: number) => new Date(now - days * DAY).toISOString();
  const kept = 'FROM courses WHERE deleted = 0';
  return {
    kept: await one(`SELECT COUNT(*) AS n ${kept}`),
    bytes: await one(`SELECT SUM(size) AS n ${kept}`),
    lessons: await one(`SELECT SUM(lesson_count) AS n ${kept}`),
    changed7: await one(`SELECT COUNT(*) AS n ${kept} AND updated_at >= ?`, since(7)),
    changed30: await one(`SELECT COUNT(*) AS n ${kept} AND updated_at >= ?`, since(30)),
    short: await one(`SELECT COUNT(*) AS n ${kept} AND lesson_count <= 5`),
    medium: await one(`SELECT COUNT(*) AS n ${kept} AND lesson_count BETWEEN 6 AND 15`),
    long: await one(`SELECT COUNT(*) AS n ${kept} AND lesson_count > 15`),
    mostInOneAccount: await one(`SELECT MAX(c) AS n FROM (SELECT COUNT(*) AS c ${kept} GROUP BY user_id)`),
  };
}

async function credits(env: Env, one: One, now: number): Promise<Stats['credits']> {
  const since = now - 30 * DAY;
  const ledger = (kind: string, from = since) => one('SELECT SUM(amount) AS n FROM credit_ledger WHERE kind = ? AND created_at >= ?', kind, from);
  const month = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1);
  // What each purchase paid is in its own line of the ledger: "1,000 credits ($10.00)".
  const paid = (await env.DB.prepare("SELECT detail FROM credit_ledger WHERE kind = 'purchase' AND created_at >= ?").bind(since).all<{ detail: string }>()).results;
  return {
    held: whole(await one('SELECT SUM(amount) AS n FROM credit_holds')),
    outstanding: whole(await one('SELECT SUM(balance) AS n FROM credits WHERE balance > 0')),
    spent30: whole(await ledger('spend')),
    spentMonth: whole(await ledger('spend', month)),
    bought30: whole(await ledger('purchase')),
    granted30: whole(await ledger('grant')),
    purchases30: paid.length,
    dollars30: Math.round(paid.reduce((n, p) => n + Number(/\(\$([\d.]+)\)/.exec(p.detail)?.[1] ?? 0), 0) * 100) / 100,
  };
}

/** The days with anything to show, newest first: the day's counts, and how many accounts were made on it. */
async function days(env: Env, now: number): Promise<Stats['days']> {
  const from = new Date(now - 30 * DAY).toISOString().slice(0, 10);
  const counted = (await env.DB.prepare('SELECT day, metric, value FROM daily_counts WHERE day >= ? ORDER BY day DESC').bind(from).all<{ day: string; metric: string; value: number }>()).results;
  const made = (await env.DB.prepare("SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS day, COUNT(*) AS value FROM users WHERE created_at >= ? GROUP BY day").bind(now - 30 * DAY).all<{ day: string; value: number }>()).results;
  const byDay = new Map<string, Record<string, number>>();
  for (const r of counted) byDay.set(r.day, { ...byDay.get(r.day), [r.metric]: r.value });
  for (const r of made) byDay.set(r.day, { ...byDay.get(r.day), new_accounts: r.value });
  return [...byDay].sort((a, b) => b[0].localeCompare(a[0])).map(([day, counts]) => ({ day, counts }));
}

export async function stats(env: Env, now = Date.now()): Promise<Stats> {
  const one: One = async (sql, ...values) => (await env.DB.prepare(sql).bind(...values).first<{ n: number | null }>())?.n ?? 0;
  const since = now - 30 * DAY;
  const models = (await env.DB.prepare("SELECT substr(detail, 1, instr(detail, ' ') - 1) AS model, COUNT(*) AS calls, SUM(-amount) AS milli FROM credit_ledger WHERE kind = 'spend' AND created_at >= ? GROUP BY model ORDER BY milli DESC").bind(since).all<{ model: string; calls: number; milli: number }>()).results;
  const heaviest = (await env.DB.prepare("SELECT SUM(-amount) AS milli FROM credit_ledger WHERE kind = 'spend' AND created_at >= ? GROUP BY user_id ORDER BY milli DESC LIMIT 5").bind(since).all<{ milli: number }>()).results;
  const byDay = await days(env, now);
  const sum = (test: (metric: string) => boolean) => byDay.reduce((n, d) => n + Object.entries(d.counts).reduce((m, [k, v]) => m + (test(k) ? v : 0), 0), 0);
  return {
    at: new Date(now).toISOString(),
    accounts: await accounts(one, now),
    courses: await courses(one, now),
    credits: await credits(env, one, now),
    models: models.map((m) => ({ model: m.model, calls: m.calls, credits: whole(m.milli) })),
    heaviest: heaviest.map((h) => whole(h.milli)),
    calls: { made30: sum((k) => k.startsWith('ai_call:')), refused30: sum((k) => k.startsWith('ai_refused:')), unreachable30: sum((k) => k === 'ai_unreachable'), ranOut30: sum((k) => k === 'credits_exhausted') },
    media: await mediaTotals(env),
    days: byDay,
  };
}
