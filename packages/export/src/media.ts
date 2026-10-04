import type { SemanticDoc } from '@folio/core';

/**
 * A course's pictures, clips and files are not in the course: it holds references, and whoever asks for an
 * export says how to turn one into bytes. Without a resolver, or where it finds nothing, an export says the
 * picture in words, as it always did.
 */
export interface ResolvedMedia {
  bytes: Uint8Array;
  /** The MIME type, e.g. image/png. */
  type: string;
  /** In pixels; 0 for what is not a picture. */
  width: number;
  height: number;
  /** The name the file had when it was added. */
  name?: string;
}

/** `picture` asks for a format Word can show (PNG, JPEG or GIF); `file` for the bytes as they are. */
export type MediaResolver = (ref: string, use: 'picture' | 'file') => Promise<ResolvedMedia | null>;

const WORD_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' } as const;
export type WordImageType = (typeof WORD_TYPES)[keyof typeof WORD_TYPES];

export function wordImageType(type: string): WordImageType | null {
  return (WORD_TYPES as Record<string, WordImageType>)[type] ?? null;
}

/** Every picture the documents show, resolved once each. One that fails is left out, and is said in words. */
export async function resolvePictures(docs: readonly SemanticDoc[], resolve: MediaResolver | undefined): Promise<Map<string, ResolvedMedia>> {
  const found = new Map<string, ResolvedMedia>();
  if (!resolve) return found;
  const refs = new Set(docs.flatMap((d) => d.blocks.flatMap((b) => (b.t === 'image' && b.src ? [b.src] : []))));
  for (const ref of refs) {
    const media = await resolve(ref, 'picture').catch(() => null);
    if (media && wordImageType(media.type) && media.width > 0 && media.height > 0) found.set(ref, media);
  }
  return found;
}
