import type { D1Database } from './types';

/**
 * The courses kept in an account. Each is stored as the page sent it (gzipped JSON of the course and its
 * undo history, which the server never reads), in pieces under D1's row limit. Every write names the version
 * it replaces, so two devices can't silently overwrite each other: the second is told, and keeps both.
 */

export const CHUNK = 900_000;
export const MAX_COURSE_BYTES = 16 * 1024 * 1024;
export const MAX_COURSES = 1000;
/** One attached file's text, gzipped: a 10 MB file's text is far smaller. */
export const MAX_SOURCE_BYTES = 4 * 1024 * 1024;

export interface CourseMeta {
  title: string;
  lessonCount: number;
  updatedAt: string;
}

export interface Listed extends CourseMeta {
  id: string;
  version: number;
  deleted: boolean;
}

export async function listCourses(db: D1Database, userId: string): Promise<Listed[]> {
  const { results } = await db
    .prepare('SELECT id, title, lesson_count, updated_at, version, deleted FROM courses WHERE user_id = ? ORDER BY updated_at DESC')
    .bind(userId)
    .all<{ id: string; title: string; lesson_count: number; updated_at: string; version: number; deleted: number }>();
  return results.map((r) => ({ id: r.id, title: r.title, lessonCount: r.lesson_count, updatedAt: r.updated_at, version: r.version, deleted: r.deleted === 1 }));
}

export async function readCourse(db: D1Database, userId: string, id: string): Promise<{ version: number; data: Uint8Array<ArrayBuffer> } | null> {
  const row = await db.prepare('SELECT version, deleted FROM courses WHERE user_id = ? AND id = ?').bind(userId, id).first<{ version: number; deleted: number }>();
  if (!row || row.deleted) return null;
  const { results } = await db.prepare('SELECT data FROM course_chunks WHERE user_id = ? AND id = ? ORDER BY n').bind(userId, id).all<{ data: ArrayBuffer | Uint8Array }>();
  return { version: row.version, data: joined(results.map((r) => new Uint8Array(r.data))) };
}

function joined(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const data = new Uint8Array(new ArrayBuffer(parts.reduce((n, p) => n + p.length, 0)));
  let at = 0;
  for (const p of parts) {
    data.set(p, at);
    at += p.length;
  }
  return data;
}

export type WriteResult = { ok: true; version: number } | { ok: false; version: number; deleted: boolean } | { ok: false; full: true } | { ok: false; missing: string[] };

/** Store one attached file's text for a course. Its text never changes, so sending it again changes nothing. */
export async function writeSource(db: D1Database, userId: string, courseId: string, sourceId: string, data: Uint8Array): Promise<void> {
  const writes = [db.prepare('DELETE FROM source_chunks WHERE user_id = ? AND course_id = ? AND source_id = ?').bind(userId, courseId, sourceId)];
  for (let n = 0; n * CHUNK < data.length; n++) {
    writes.push(db.prepare('INSERT INTO source_chunks (user_id, course_id, source_id, n, data) VALUES (?, ?, ?, ?, ?)').bind(userId, courseId, sourceId, n, data.subarray(n * CHUNK, (n + 1) * CHUNK)));
  }
  await db.batch(writes);
}

export async function readSource(db: D1Database, userId: string, courseId: string, sourceId: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const { results } = await db
    .prepare('SELECT data FROM source_chunks WHERE user_id = ? AND course_id = ? AND source_id = ? ORDER BY n')
    .bind(userId, courseId, sourceId)
    .all<{ data: ArrayBuffer | Uint8Array }>();
  return results.length ? joined(results.map((r) => new Uint8Array(r.data))) : null;
}

/** Which of these texts the account doesn't have for the course. */
async function missingSources(db: D1Database, userId: string, courseId: string, sourceIds: string[]): Promise<string[]> {
  if (!sourceIds.length) return [];
  const { results } = await db.prepare('SELECT DISTINCT source_id FROM source_chunks WHERE user_id = ? AND course_id = ?').bind(userId, courseId).all<{ source_id: string }>();
  const have = new Set(results.map((r) => r.source_id));
  return sourceIds.filter((id) => !have.has(id));
}

/**
 * Store a course if the account's copy is still the version the device last had (0 for a course the account
 * has never had). The version is claimed first, so of two writes racing from the same version one wins.
 */
/**
 * `sources`: the texts this body refers to, from a page that keeps texts apart; null from an older page, whose
 * bodies carry their texts. Every text referred to must be here first; texts no longer referred to go.
 */
export async function writeCourse(db: D1Database, userId: string, id: string, base: number, meta: CourseMeta, data: Uint8Array, sources: string[] | null = null): Promise<WriteResult> {
  if (sources) {
    const missing = await missingSources(db, userId, id, sources);
    if (missing.length) return { ok: false, missing };
  }
  const next = base + 1;
  const claim =
    base === 0
      ? await db
          .prepare('INSERT INTO courses (user_id, id, title, lesson_count, updated_at, version, size) SELECT ?, ?, ?, ?, ?, 1, ? WHERE (SELECT COUNT(*) FROM courses WHERE user_id = ?) < ? ON CONFLICT DO NOTHING')
          .bind(userId, id, meta.title, meta.lessonCount, meta.updatedAt, data.length, userId, MAX_COURSES)
          .run()
      : await db
          .prepare('UPDATE courses SET title = ?, lesson_count = ?, updated_at = ?, version = ?, size = ? WHERE user_id = ? AND id = ? AND version = ? AND deleted = 0')
          .bind(meta.title, meta.lessonCount, meta.updatedAt, next, data.length, userId, id, base)
          .run();
  if (claim.meta.changes !== 1) {
    const row = await db.prepare('SELECT version, deleted FROM courses WHERE user_id = ? AND id = ?').bind(userId, id).first<{ version: number; deleted: number }>();
    if (!row && base === 0) return { ok: false, full: true };
    return { ok: false, version: row?.version ?? 0, deleted: row?.deleted === 1 };
  }
  const writes = [db.prepare('DELETE FROM course_chunks WHERE user_id = ? AND id = ?').bind(userId, id)];
  for (let n = 0; n * CHUNK < data.length; n++) {
    writes.push(db.prepare('INSERT INTO course_chunks (user_id, id, n, data) VALUES (?, ?, ?, ?)').bind(userId, id, n, data.subarray(n * CHUNK, (n + 1) * CHUNK)));
  }
  if (sources) {
    // Bound as a JSON list: one statement however many files the course has.
    writes.push(db.prepare('DELETE FROM source_chunks WHERE user_id = ? AND course_id = ? AND source_id NOT IN (SELECT value FROM json_each(?))').bind(userId, id, JSON.stringify(sources)));
  }
  await db.batch(writes);
  return { ok: true, version: next };
}

/** A deleted course leaves a marker, so the account's other devices delete their copies too. */
export async function removeCourse(db: D1Database, userId: string, id: string): Promise<void> {
  await db.batch([
    db.prepare("UPDATE courses SET deleted = 1, version = version + 1, title = '', size = 0 WHERE user_id = ? AND id = ?").bind(userId, id),
    db.prepare('DELETE FROM course_chunks WHERE user_id = ? AND id = ?').bind(userId, id),
    db.prepare('DELETE FROM source_chunks WHERE user_id = ? AND course_id = ?').bind(userId, id),
  ]);
}

/** Everything the account holds, and the account itself. */
export async function removeAccount(db: D1Database, userId: string): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM course_chunks WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM source_chunks WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM courses WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM users WHERE id = ?').bind(userId),
    // The balance goes with the account, unless it is owed (spent, then refunded): that waits for the same
    // Google sign-in to come back. Its record of free credits stays too, so a new account doesn't start with
    // them again; purchases stay on the books.
    db.prepare('DELETE FROM credits WHERE user_id = ? AND balance >= 0').bind(userId),
    db.prepare('DELETE FROM credit_holds WHERE user_id = ?').bind(userId),
    db.prepare("DELETE FROM credit_ledger WHERE user_id = ? AND kind = 'spend'").bind(userId),
  ]);
}
