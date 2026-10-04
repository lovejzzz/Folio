import { localMediaId, newId } from '@folio/core';
import { db, type MediaRow } from './db';

/**
 * The pictures, clips and files a teacher adds to a course's pages. They are kept on this device, beside the
 * course and apart from it: the course holds `media:<id>`, so its text stays small, saves stay quick, and undo
 * can bring a removed picture back for as long as its bytes are still here.
 */

const key = (courseId: string, id: string) => `${courseId}:${id}`;

/** "screen shot.PNG" → "png"; a file with no usable extension gets the one its type implies, or none. */
function extensionOf(name: string, type: string): string {
  const fromName = /\.([A-Za-z0-9]{1,8})$/.exec(name)?.[1]?.toLowerCase();
  const fromType = /^[a-z]+\/([a-z0-9]{1,8})$/.exec(type)?.[1];
  // The type wins for pictures and video, which Folio may have re-encoded under the old name.
  const ext = (/^(image|video)\//.test(type) ? fromType : undefined) ?? fromName ?? fromType ?? '';
  return ext === 'jpeg' ? 'jpg' : ext === 'quicktime' ? 'mov' : ext;
}

/** Keep a file for a course and say what to call it by. The ID ends with the file's extension, so an export can name it. */
export async function putMedia(courseId: string, file: Blob, name: string, now = Date.now()): Promise<string> {
  const ext = extensionOf(name, file.type);
  const id = ext ? `${newId('m')}.${ext}` : newId('m');
  await db.media.put({ key: key(courseId, id), courseId, id, name, type: file.type, bytes: file.size, blob: file, at: now });
  return id;
}

/** Keep a file under the ID it already has: one read from a backup. */
export async function restoreMedia(courseId: string, media: { id: string; name: string; type: string; bytes: Uint8Array }, now = Date.now()): Promise<void> {
  const blob = new Blob([media.bytes as BlobPart], { type: media.type });
  await db.media.put({ key: key(courseId, media.id), courseId, id: media.id, name: media.name, type: media.type, bytes: blob.size, blob, at: now });
}

export async function getMedia(courseId: string, id: string): Promise<MediaRow | null> {
  return (await db.media.get(key(courseId, id))) ?? null;
}

/** What a reference stands for on this device, or null: a path, or something added on another device. */
export async function mediaOf(courseId: string, ref: string): Promise<MediaRow | null> {
  const id = localMediaId(ref);
  return id ? getMedia(courseId, id) : null;
}

export async function deleteCourseMedia(courseId: string): Promise<void> {
  await db.media.where('courseId').equals(courseId).delete();
}

/** A copy of a course takes a copy of its media: either can then be deleted without the other losing a picture. */
export async function copyCourseMedia(fromId: string, toId: string): Promise<void> {
  // One at a time: a course's clips together can be more than memory should hold twice.
  const keys = await db.media.where('courseId').equals(fromId).primaryKeys();
  for (const k of keys) {
    const row = await db.media.get(k);
    if (row) await db.media.put({ ...row, key: key(toId, row.id), courseId: toId });
  }
}

/** Every media ID a value mentions, however deep: a course, or a step of its history. */
function mentioned(value: unknown, into: Set<string>): Set<string> {
  for (const m of JSON.stringify(value ?? null).matchAll(/"media:([A-Za-z0-9_.-]+)"/g)) into.add(m[1]!);
  return into;
}

/** How long a file is left alone after it is added: the change that places it on the page may not be saved yet. */
const GRACE_MS = 60 * 60 * 1000;

/**
 * Clear away what nothing can show again: media the course no longer mentions, in its pages or in any step of
 * its history (undo can bring a removed picture back). `open` is the course as this tab holds it, with whatever
 * of its history is not saved yet. Run when a course is opened, never while it is edited.
 */
export async function dropUnusedMedia(courseId: string, open: unknown, now = Date.now()): Promise<string[]> {
  const rows = await db.media.where('courseId').equals(courseId).toArray();
  if (!rows.length) return [];
  const needed = mentioned(open, new Set());
  const saved = await db.courses.get(courseId);
  mentioned(saved?.data, needed);
  await db.history.where('courseId').equals(courseId).each((row) => void mentioned(row.entry, needed));
  const gone = rows.filter((r) => !needed.has(r.id) && now - r.at > GRACE_MS);
  if (gone.length) await db.media.bulkDelete(gone.map((r) => r.key));
  return gone.map((r) => r.id);
}
