import type { D1Database } from './types';

/**
 * How Folio is doing, counted per day across everyone: sign-ins, AI calls and how they ended, credits used,
 * purchases. A count is a number only, never tied to an account, an address or a course, so it answers "what
 * is breaking" without watching anyone. Read them in the D1 console: SELECT * FROM daily_counts ORDER BY day DESC.
 */
export async function count(db: D1Database, metric: string, by = 1, now = Date.now()): Promise<void> {
  const day = new Date(now).toISOString().slice(0, 10);
  try {
    await db
      .prepare('INSERT INTO daily_counts (day, metric, value) VALUES (?, ?, ?) ON CONFLICT(day, metric) DO UPDATE SET value = value + excluded.value')
      .bind(day, metric, by)
      .run();
  } catch {
    // A count that can't be written is lost, never the request it was counting.
  }
}
