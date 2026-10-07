import { isLocalMedia, localMediaRef, type Course } from '@folio/core';
import type { FolioMedia, MediaResolver, ResolvedMedia } from '@folio/export';
import { mediaAnywhere } from '../state/mediaSync';

/**
 * Where an export gets a course's pictures, clips and files: from this device for what the teacher added, and
 * from the site for a sample course's own. Word shows PNG, JPEG and GIF only, and a file full of large
 * screenshots is too heavy to send or to open in Google Docs, so a picture bound for a document is redrawn as
 * JPEG when it is another format or larger than a page can use.
 */

const WORD_TYPES = ['image/png', 'image/jpeg', 'image/gif'];
/** A page's text is about 6.5 inches wide: this is still 240 dots to the inch. */
const WORD_WIDTH = 1600;
const WORD_BYTES = 1024 * 1024;

async function read(courseId: string, ref: string): Promise<{ blob: Blob; name?: string } | null> {
  if (isLocalMedia(ref)) {
    const row = await mediaAnywhere(courseId, ref);
    return row && { blob: row.blob, name: row.name };
  }
  // Only the site's own files: a course opened from a backup could name any address.
  if (!ref.startsWith('/') || ref.startsWith('//')) return null;
  const response = await fetch(ref);
  return response.ok ? { blob: await response.blob() } : null;
}

async function redraw(bitmap: ImageBitmap, width: number, height: number): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // JPEG has no transparency: what was see-through is set on white, as paper is.
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
}

async function picture(blob: Blob): Promise<ResolvedMedia | null> {
  const bitmap = await createImageBitmap(blob);
  try {
    const { width, height } = bitmap;
    const fits = WORD_TYPES.includes(blob.type) && ((width <= WORD_WIDTH && blob.size <= WORD_BYTES) || blob.type === 'image/gif');
    if (fits) return { bytes: new Uint8Array(await blob.arrayBuffer()), type: blob.type, width, height };
    const scale = Math.min(1, WORD_WIDTH / width);
    const size = { width: Math.round(width * scale), height: Math.round(height * scale) };
    const drawn = await redraw(bitmap, size.width, size.height);
    return drawn && { bytes: new Uint8Array(await drawn.arrayBuffer()), type: drawn.type, ...size };
  } finally {
    bitmap.close();
  }
}

/** The resolver an export of this course is given. It runs on the page, where the device's media and a canvas are. */
export function mediaResolver(courseId: string): MediaResolver {
  return async (ref, use) => {
    const found = await read(courseId, ref);
    if (!found) return null;
    if (use === 'picture') return picture(found.blob);
    return { bytes: new Uint8Array(await found.blob.arrayBuffer()), type: found.blob.type, width: 0, height: 0, ...(found.name ? { name: found.name } : {}) };
  };
}

/** Everything a backup of this course carries beside its text. */
export async function backupMedia(course: Course): Promise<FolioMedia[]> {
  const { courseMediaIds } = await import('@folio/export/files');
  const resolve = mediaResolver(course.id);
  const out: FolioMedia[] = [];
  for (const id of courseMediaIds(course)) {
    const found = await resolve(localMediaRef(id), 'file');
    if (found) out.push({ id, name: found.name ?? id, type: found.type, bytes: found.bytes });
  }
  return out;
}
