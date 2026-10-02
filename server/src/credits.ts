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

/** New school accounts start with enough for about 25 lessons with every material: a 15-week course and most of a second. */
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
  // OpenAI bills reasoning as output and charges nothing to write its cache.
  'gpt-6-luna': [0.1, 0.5, 0.01, 0],
  'gpt-6.1-sol': [2, 10, 0.1, 0],
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

/** The free credits are for teachers at schools: a Google address, confirmed by Google, ending in .edu. */
export function schoolEmail(email: string, verified: boolean): boolean {
  return verified && /\.edu$/i.test(email.trim());
}

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
    // As the privacy page says: a network's count is kept for its day only, then goes.
    db.prepare('DELETE FROM free_grants WHERE day < ?').bind(day),
  ]);
  return amount;
}

/** Credits bought: added once per payment, however many times the payment is reported. */
export function addPurchase(db: D1Database, userId: string, amount: number, ref: string, detail: string, now = Date.now()): Promise<boolean> {
  return addEntry(db, userId, 'purchase', amount, ref, detail, now);
}

/** A ledger entry and its change to the balance, made once per ref. False when it was already made. */
export async function addEntry(db: D1Database, userId: string, kind: string, amount: number, ref: string, detail: string, now = Date.now()): Promise<boolean> {
  const had = await db.prepare('SELECT 1 AS x FROM credit_ledger WHERE ref = ?').bind(ref).first();
  if (had) return false;
  await db.batch([
    db.prepare('INSERT INTO credit_ledger (id, user_id, kind, amount, ref, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id(), userId, kind, amount, ref, detail, now),
    db
      .prepare('INSERT INTO credits (user_id, balance, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET balance = balance + excluded.balance, updated_at = excluded.updated_at')
      .bind(userId, amount, now),
  ]);
  return true;
}

/** The purchase a payment made: whose it was and what it added. */
export function purchaseOf(db: D1Database, ref: string): Promise<{ user_id: string; amount: number } | null> {
  return db.prepare("SELECT user_id, amount FROM credit_ledger WHERE ref = ? AND kind = 'purchase'").bind(ref).first<{ user_id: string; amount: number }>();
}

/** What the entry with this ref added (or took), or null when there is none. */
export async function amountOf(db: D1Database, ref: string): Promise<number | null> {
  const row = await db.prepare('SELECT amount FROM credit_ledger WHERE ref = ?').bind(ref).first<{ amount: number }>();
  return row?.amount ?? null;
}

/** What the entries whose refs begin with `prefix` came to, in all. */
export async function totalOf(db: D1Database, prefix: string): Promise<number> {
  const row = await db.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM credit_ledger WHERE substr(ref, 1, ?) = ?').bind(prefix.length, prefix).first<{ total: number }>();
  return row?.total ?? 0;
}

/**
 * Hold credits for a call before it starts: the estimate if the balance covers it, or else whatever is left
 * above the floor, so a teacher near the end of their credits can still finish a part. Null when too little.
 */
export async function reserve(db: D1Database, userId: string, estimate: number, now = Date.now()): Promise<Hold | null> {
  await returnLostHolds(db, userId, now);
  const held = await holdIf(db, userId, estimate, now, 'balance >= ?', estimate);
  if (held) return held;
  const balance = await balanceOf(db, userId);
  if (balance < FLOOR) return null;
  return holdIf(db, userId, balance, now, 'balance = ?', balance);
}

/** Credits held for a call while it runs, written down so a hold whose settling is lost can be given back. */
export interface Hold {
  id: string;
  amount: number;
}

/** Longer than any call runs (the page gives up after ten minutes): a hold this old was never settled. */
export const HOLD_LIFETIME = 15 * 60 * 1000;

/**
 * Take `amount` from the balance when `condition` holds, and write the hold down, in one transaction: the
 * credits are never taken without the record that gives them back. The hold is written first, only if the
 * balance allows it; the balance is then taken from only if that hold exists. Both are plain conditions, so
 * nothing rests on how a database reports what a statement changed.
 */
async function holdIf(db: D1Database, userId: string, amount: number, now: number, condition: string, value: number): Promise<Hold | null> {
  const hold = { id: id(), amount };
  const [written] = await db.batch([
    db.prepare(`INSERT INTO credit_holds (id, user_id, amount, created_at) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM credits WHERE user_id = ? AND ${condition})`).bind(hold.id, userId, amount, now, userId, value),
    db.prepare('UPDATE credits SET balance = balance - ?, updated_at = ? WHERE user_id = ? AND EXISTS (SELECT 1 FROM credit_holds WHERE id = ?)').bind(amount, now, userId, hold.id),
  ]);
  return written?.meta.changes === 1 ? hold : null;
}

/** Give back what calls whose settling was lost (the worker stopped partway) still hold. */
export async function returnLostHolds(db: D1Database, userId: string, now = Date.now()): Promise<void> {
  // Given back and deleted in one transaction: never twice, and never deleted without being given back.
  const before = now - HOLD_LIFETIME;
  await db.batch([
    db.prepare('UPDATE credits SET balance = balance + (SELECT COALESCE(SUM(amount), 0) FROM credit_holds WHERE user_id = ? AND created_at < ?), updated_at = ? WHERE user_id = ? AND EXISTS (SELECT 1 FROM credit_holds WHERE user_id = ? AND created_at < ?)').bind(userId, before, now, userId, userId, before),
    db.prepare('DELETE FROM credit_holds WHERE user_id = ? AND created_at < ?').bind(userId, before),
  ]);
}

/** Settle a call: give back what was held beyond its cost (unless it was already given back as lost), and record the cost. */
export async function settle(db: D1Database, userId: string, hold: Hold, cost: number, detail: string, now = Date.now()): Promise<void> {
  // One transaction: what was held comes back only while its hold is still open (not already given back as
  // lost), the hold goes, and the cost is recorded, all or none.
  const statements = [
    db.prepare('UPDATE credits SET balance = balance + (CASE WHEN EXISTS (SELECT 1 FROM credit_holds WHERE id = ?) THEN ? ELSE 0 END) - ?, updated_at = ? WHERE user_id = ?').bind(hold.id, hold.amount, cost, now, userId),
    db.prepare('DELETE FROM credit_holds WHERE id = ?').bind(hold.id),
  ];
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
  await returnLostHolds(db, userId);
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
