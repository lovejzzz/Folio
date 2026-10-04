/**
 * A file on its way into a page. Pictures are kept as they are when they are small enough to store and share;
 * a larger one is scaled to a width a page can still use and re-encoded, gently: a screenshot has to stay
 * legible. Video is never touched, only given a poster: its first frame, shown before it plays and on paper.
 */

export type MediaKind = 'image' | 'video' | 'file';
export type MediaProblem = 'wrongType' | 'tooLarge' | 'unreadable';

export class MediaFileError extends Error {
  constructor(
    readonly problem: MediaProblem,
    readonly kind: MediaKind,
  ) {
    super(`media ${kind}: ${problem}`);
    this.name = 'MediaFileError';
  }
}

const MB = 1024 * 1024;
export const MEDIA_LIMITS = { imageOriginal: 25 * MB, imageKept: 1.5 * MB, imageWidth: 2400, video: 200 * MB, file: 200 * MB } as const;

const IMAGE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
const VIDEO_TYPES: Record<string, string> = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' };

/** What the file picker offers for each kind of place. */
export const ACCEPT: Record<MediaKind, string | undefined> = {
  image: 'image/png,image/jpeg,image/webp,image/gif',
  video: 'video/mp4,video/webm,video/quicktime,.mp4,.m4v,.webm,.mov',
  file: undefined,
};

/** The type a file is, by what the browser says or, where it says nothing, by its name. */
function typeOf(file: { name: string; type: string }, known: Record<string, string>): string | null {
  if (Object.values(known).includes(file.type)) return file.type;
  const ext = /\.([A-Za-z0-9]+)$/.exec(file.name)?.[1]?.toLowerCase() ?? '';
  return known[ext] ?? null;
}

/** Whether a file can go in a place of this kind: its type as Folio will store it, or what is wrong with it. */
export function checkMedia(kind: MediaKind, file: { name: string; type: string; size: number }): { type: string } | { problem: MediaProblem } {
  if (kind === 'file') return file.size > MEDIA_LIMITS.file ? { problem: 'tooLarge' } : { type: file.type };
  const type = typeOf(file, kind === 'image' ? IMAGE_TYPES : VIDEO_TYPES);
  if (!type) return { problem: 'wrongType' };
  return file.size > (kind === 'image' ? MEDIA_LIMITS.imageOriginal : MEDIA_LIMITS.video) ? { problem: 'tooLarge' } : { type };
}

export interface PreparedMedia {
  blob: Blob;
  name: string;
  /** A video's first frame. */
  poster?: Blob;
}

function encode(source: CanvasImageSource, width: number, height: number): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(source, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9));
}

/** A picture as it will be kept: itself when small enough, else narrower and as WebP. A GIF may move, so it is never redrawn. */
async function prepareImage(file: Blob, type: string): Promise<Blob> {
  const original = file.type === type ? file : new Blob([file], { type });
  if (type === 'image/gif') return original;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new MediaFileError('unreadable', 'image');
  }
  try {
    if (file.size <= MEDIA_LIMITS.imageKept && bitmap.width <= MEDIA_LIMITS.imageWidth) return original;
    const scale = Math.min(1, MEDIA_LIMITS.imageWidth / bitmap.width);
    const encoded = await encode(bitmap, Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
    // A browser that can't write WebP hands back a PNG, often larger than what it was given: then the original stays.
    return encoded && (encoded.size < file.size || scale < 1) ? encoded : original;
  } finally {
    bitmap.close();
  }
}

const POSTER_WAIT_MS = 8000;

/** The first frame of a video, or nothing where this browser can't play it: the video is kept either way. */
async function posterOf(file: Blob): Promise<Blob | undefined> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), POSTER_WAIT_MS);
      const done = (ok: boolean) => {
        clearTimeout(timer);
        if (ok) resolve();
        else reject(new Error('unplayable'));
      };
      video.addEventListener('loadeddata', () => done(true), { once: true });
      video.addEventListener('error', () => done(false), { once: true });
      video.src = url;
    });
    if (!video.videoWidth) return undefined;
    const scale = Math.min(1, MEDIA_LIMITS.imageWidth / video.videoWidth);
    return (await encode(video, Math.round(video.videoWidth * scale), Math.round(video.videoHeight * scale))) ?? undefined;
  } catch {
    return undefined;
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

/** Make a file ready to keep, or throw a MediaFileError that says what is wrong with it. */
export async function prepareMedia(kind: MediaKind, file: File): Promise<PreparedMedia> {
  const checked = checkMedia(kind, file);
  if ('problem' in checked) throw new MediaFileError(checked.problem, kind);
  if (kind === 'image') return { blob: await prepareImage(file, checked.type), name: file.name };
  if (kind === 'file') return { blob: file, name: file.name };
  const blob = file.type === checked.type ? file : new Blob([file], { type: checked.type });
  const poster = await posterOf(blob);
  return { blob, name: file.name, ...(poster ? { poster } : {}) };
}
