import type { D1Database } from './types';

/**
 * The courses kept in an account. Each is stored as the page sent it (gzipped JSON of the course and its
 * undo history, which the server never reads), in pieces under D1's row limit. Every write names the version
 * it replaces, so two devices can't silently overwrite each other: the second is told, and keeps both.
 */

export const CHUNK = 900_000;
export const MAX_COURSE_BYTES = 16 * 1024 * 1024;
export const MAX_COURSES = 1000;

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
  const parts = results.map((r) => new Uint8Array(r.data));
  const data = new Uint8Array(new ArrayBuffer(parts.reduce((n, p) => n + p.length, 0)));
  let at = 0;
  for (const p of parts) {
    data.set(p, at);
    at += p.length;
  }
  return { version: row.version, data };
}

export type WriteResult = { ok: true; version: number } | { ok: false; version: number; deleted: boolean } | { ok: false; full: true };

/**
 * Store a course if the account's copy is still the version the device last had (0 for a course the account
 * has never had). The version is claimed first, so of two writes racing from the same version one wins.
 */
export async function writeCourse(db: D1Database, userId: string, id: string, base: number, meta: CourseMeta, data: Uint8Array): Promise<WriteResult> {
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
  await db.batch(writes);
  return { ok: true, version: next };
}

/** A deleted course leaves a marker, so the account's other devices delete their copies too. */
export async function removeCourse(db: D1Database, userId: string, id: string): Promise<void> {
  await db.batch([
    db.prepare("UPDATE courses SET deleted = 1, version = version + 1, title = '', size = 0 WHERE user_id = ? AND id = ?").bind(userId, id),
    db.prepare('DELETE FROM course_chunks WHERE user_id = ? AND id = ?').bind(userId, id),
  ]);
}

/** Everything the account holds, and the account itself. */
export async function removeAccount(db: D1Database, userId: string): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM course_chunks WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM courses WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM users WHERE id = ?').bind(userId),
  ]);
}
