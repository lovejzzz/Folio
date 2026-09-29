import type { D1Database } from './types';

/**
 * Folio credits: what a teacher who writes with Folio's own model access holds. A credit is a cent at the
 * price Folio sells them; a model call costs its token price at Anthropic's rates times MARKUP. Amounts are
 * kept in millicredits so no call's cost rounds to nothing.
 */

export const MILLI = 1000;
/** What a credit sells for, and how much more than the model's own price a call is charged. */
export const CREDIT_USD = 0.01;
export const MARKUP = 3;

/** New accounts start with enough for one full course: a 15-week, one-lesson-a-week college course. */
export const FREE_CREDITS = 750;
/** A wave of new accounts can't farm the free credits: so many a day per network address, so many a month in all. */
export const FREE_PER_ADDRESS_PER_DAY = 3;
export const FREE_CREDITS_PER_MONTH = 150_000;
/** Below this, a call isn't started: it would only run the balance further under. */
export const FLOOR = 5 * MILLI;

/** $ per million tokens: input, output, cache read, cache write. Only these models can be reached with credits. */
export const PRICES: Record<string, [number, number, number, number]> = {
  'claude-sonnet-5-5': [2, 10, 0.2, 2.5],
  'claude-opus-5-5': [4, 20, 0.2, 5],
};

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** What a call's tokens cost the teacher, in millicredits. */
export function charge(model: string, u: Usage): number {
  const p = PRICES[model];
  if (!p) return 0;
  const usd = (u.input * p[0] + u.output * p[1] + u.cacheRead * p[2] + u.cacheWrite * p[3]) / 1e6;
  return Math.ceil((usd * MARKUP * MILLI) / CREDIT_USD);
}

const id = () => crypto.randomUUID();

export async function balanceOf(db: D1Database, userId: string): Promise<number> {
  const row = await db.prepare('SELECT balance FROM credits WHERE user_id = ?').bind(userId).first<{ balance: number }>();
  return row?.balance ?? 0;
}

const monthStart = (now: number) => {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
};

/**
 * The free credits, once per account, the first time it signs in; none past the day's limit for its network
 * address or the month's limit for everyone. Returns what was granted.
 */
export async function grantFree(db: D1Database, userId: string, addressHash: string, now = Date.now()): Promise<number> {
  const had = await db.prepare('SELECT 1 AS x FROM credit_ledger WHERE ref = ?').bind(`grant:${userId}`).first();
  if (had) return 0;
  const day = new Date(now).toISOString().slice(0, 10);
  const today = await db.prepare('SELECT count FROM free_grants WHERE ip_hash = ? AND day = ?').bind(addressHash, day).first<{ count: number }>();
  const month = await db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM credit_ledger WHERE kind = 'grant' AND created_at >= ?")
    .bind(monthStart(now))
    .first<{ total: number }>();
  const amount = FREE_CREDITS * MILLI;
  // An account turned away today can still start with its own key; it isn't marked, so it may be granted later.
  if ((today?.count ?? 0) >= FREE_PER_ADDRESS_PER_DAY || (month?.total ?? 0) + amount > FREE_CREDITS_PER_MONTH * MILLI) return 0;
  await db.batch([
    db.prepare("INSERT INTO credit_ledger (id, user_id, kind, amount, ref, detail, created_at) VALUES (?, ?, 'grant', ?, ?, 'Free credits to start', ?)").bind(id(), userId, amount, `grant:${userId}`, now),
    db
      .prepare('INSERT INTO credits (user_id, balance, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET balance = balance + excluded.balance, updated_at = excluded.updated_at')
      .bind(userId, amount, now),
    db
      .prepare('INSERT INTO free_grants (ip_hash, day, count) VALUES (?, ?, 1) ON CONFLICT(ip_hash, day) DO UPDATE SET count = count + 1')
      .bind(addressHash, day),
  ]);
  return amount;
}

/** Credits bought: added once per payment, however many times the payment is reported. */
export async function addPurchase(db: D1Database, userId: string, amount: number, ref: string, detail: string, now = Date.now()): Promise<boolean> {
  const had = await db.prepare('SELECT 1 AS x FROM credit_ledger WHERE ref = ?').bind(ref).first();
  if (had) return false;
  await db.batch([
    db.prepare("INSERT INTO credit_ledger (id, user_id, kind, amount, ref, detail, created_at) VALUES (?, ?, 'purchase', ?, ?, ?, ?)").bind(id(), userId, amount, ref, detail, now),
    db
      .prepare('INSERT INTO credits (user_id, balance, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET balance = balance + excluded.balance, updated_at = excluded.updated_at')
      .bind(userId, amount, now),
  ]);
  return true;
}

/**
 * Hold credits for a call before it starts: the estimate if the balance covers it, or else whatever is left
 * above the floor, so a teacher near the end of their credits can still finish a part. Null when too little.
 */
export async function reserve(db: D1Database, userId: string, estimate: number, now = Date.now()): Promise<number | null> {
  const held = await db.prepare('UPDATE credits SET balance = balance - ?, updated_at = ? WHERE user_id = ? AND balance >= ?').bind(estimate, now, userId, estimate).run();
  if (held.meta.changes === 1) return estimate;
  const balance = await balanceOf(db, userId);
  if (balance < FLOOR) return null;
  const rest = await db.prepare('UPDATE credits SET balance = balance - ?, updated_at = ? WHERE user_id = ? AND balance = ?').bind(balance, now, userId, balance).run();
  return rest.meta.changes === 1 ? balance : null;
}

/** Settle a call: give back what was held beyond its cost, and record the cost. */
export async function settle(db: D1Database, userId: string, held: number, cost: number, detail: string, now = Date.now()): Promise<void> {
  const statements = [db.prepare('UPDATE credits SET balance = balance + ?, updated_at = ? WHERE user_id = ?').bind(held - cost, now, userId)];
  if (cost > 0) {
    statements.push(db.prepare("INSERT INTO credit_ledger (id, user_id, kind, amount, ref, detail, created_at) VALUES (?, ?, 'spend', ?, NULL, ?, ?)").bind(id(), userId, -cost, detail, now));
  }
  await db.batch(statements);
}

export interface LedgerRow {
  kind: string;
  amount: number;
  detail: string;
  created_at: number;
}

/** The balance and the latest purchases and grants, for the account page. Spending is summed, not listed. */
export async function statement(db: D1Database, userId: string): Promise<{ balance: number; added: LedgerRow[]; spent30: number }> {
  const [balance, added, spent] = await Promise.all([
    balanceOf(db, userId),
    db.prepare("SELECT kind, amount, detail, created_at FROM credit_ledger WHERE user_id = ? AND kind != 'spend' ORDER BY created_at DESC LIMIT 20").bind(userId).all<LedgerRow>(),
    db
      .prepare("SELECT COALESCE(-SUM(amount), 0) AS total FROM credit_ledger WHERE user_id = ? AND kind = 'spend' AND created_at >= ?")
      .bind(userId, Date.now() - 30 * 86400 * 1000)
      .first<{ total: number }>(),
  ]);
  return { balance, added: added.results, spent30: spent?.total ?? 0 };
}
