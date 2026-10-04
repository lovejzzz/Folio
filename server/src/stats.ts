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
  accounts: { all: number; week: number };
  courses: { kept: number; bytes: number };
  credits: { held: number; outstanding: number; spent30: number; bought30: number; granted30: number };
  media: { files: number; bytes: number } | null;
  /** The last 30 days, newest first: each day's counts by name. */
  days: { day: string; counts: Record<string, number> }[];
}

async function mediaTotals(env: Env): Promise<Stats['media']> {
  if (!env.MEDIA) return null;
  let files = 0;
  let bytes = 0;
  let cursor: string | undefined;
  do {
    const page = await env.MEDIA.list({ prefix: '', cursor });
    files += page.objects.length;
    bytes += page.objects.reduce((n, o) => n + o.size, 0);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return { files, bytes };
}

export async function stats(env: Env, now = Date.now()): Promise<Stats> {
  const one = async (sql: string, ...values: unknown[]) => ((await env.DB.prepare(sql).bind(...values).first<{ n: number | null }>())?.n ?? 0);
  const since = now - 30 * DAY;
  const ledger = (kind: string) => one('SELECT SUM(amount) AS n FROM credit_ledger WHERE kind = ? AND created_at >= ?', kind, since);
  const credits = (milli: number) => Math.round(Math.abs(milli) / MILLI);
  const rows = (await env.DB.prepare('SELECT day, metric, value FROM daily_counts WHERE day >= ? ORDER BY day DESC').bind(new Date(since).toISOString().slice(0, 10)).all<{ day: string; metric: string; value: number }>()).results;
  const days = new Map<string, Record<string, number>>();
  for (const r of rows) days.set(r.day, { ...days.get(r.day), [r.metric]: r.value });
  return {
    at: new Date(now).toISOString(),
    accounts: { all: await one('SELECT COUNT(*) AS n FROM users'), week: await one('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?', now - 7 * DAY) },
    courses: { kept: await one('SELECT COUNT(*) AS n FROM courses WHERE deleted = 0'), bytes: await one('SELECT SUM(size) AS n FROM courses WHERE deleted = 0') },
    credits: {
      held: credits(await one('SELECT SUM(amount) AS n FROM credit_holds')),
      outstanding: credits(await one('SELECT SUM(balance) AS n FROM credits WHERE balance > 0')),
      spent30: credits(await ledger('spend')),
      bought30: credits(await ledger('purchase')),
      granted30: credits(await ledger('grant')),
    },
    media: await mediaTotals(env),
    days: [...days].map(([day, counts]) => ({ day, counts })),
  };
}
