import type { D1Database } from './types';

/**
 * The tables and columns server/schema.sql makes, which every query here relies on. Production's D1 is changed
 * by hand before the code that needs a change ships; /api/health compares it with this, so a step left out
 * shows at once. A test keeps this list the same as schema.sql.
 */
export const SCHEMA_SHAPE: Record<string, string[]> = {
  course_chunks: ['data', 'id', 'n', 'user_id'],
  courses: ['deleted', 'id', 'lesson_count', 'size', 'title', 'updated_at', 'user_id', 'version'],
  credit_holds: ['amount', 'created_at', 'id', 'user_id'],
  credit_ledger: ['amount', 'created_at', 'detail', 'id', 'kind', 'ref', 'user_id'],
  credits: ['balance', 'updated_at', 'user_id'],
  daily_counts: ['day', 'metric', 'value'],
  free_grants: ['count', 'day', 'ip_hash'],
  sessions: ['expires_at', 'id_hash', 'user_id'],
  source_chunks: ['course_id', 'data', 'n', 'source_id', 'user_id'],
  users: ['created_at', 'email', 'id', 'name'],
};

/** What the database lacks of SCHEMA_SHAPE, as "table" or "table.column"; empty when it has it all. */
export async function missingSchema(db: D1Database): Promise<string[]> {
  const missing: string[] = [];
  for (const [table, columns] of Object.entries(SCHEMA_SHAPE)) {
    // The names are this file's own, never the request's: safe to put in the statement.
    const { results } = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
    const have = new Set(results.map((r) => r.name));
    if (!have.size) missing.push(table);
    else for (const column of columns) if (!have.has(column)) missing.push(`${table}.${column}`);
  }
  return missing;
}

/** How long one answer stands: a public endpoint, so a burst of requests costs the database one check a minute. */
const CHECKED_FOR = 60_000;
let checked: { at: number; missing: string[] } | null = null;

/** missingSchema, asked at most once a minute by each worker. A gap found is asked again next time. */
export async function missingSchemaCached(db: D1Database, now = Date.now()): Promise<string[]> {
  if (checked && !checked.missing.length && now - checked.at < CHECKED_FOR) return checked.missing;
  checked = { at: now, missing: await missingSchema(db) };
  return checked.missing;
}
