import { isFileName, isLocalMedia, localMediaId, type PageBlock } from './page';
import type { Course } from './schema';

/**
 * The names a course's own pictures, clips and files take when they leave Folio as files (the media folder of
 * a zip). They say where each belongs, so a teacher can find one and upload it to the right week:
 * `week-3-2-the-finished-scene.webp` is the second picture of week 3. A file keeps its label when that is a name.
 */

const SLUG_LENGTH = 40;

function slug(text: string): string {
  const words = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  return words.slice(0, SLUG_LENGTH).replace(/-+$/, '');
}

/** The extension the device gave the file when it was added: its ID ends with it. */
function extension(ref: string): string {
  const ext = /\.([a-z0-9]{1,8})$/.exec(localMediaId(ref) ?? '')?.[1];
  return ext ? `.${ext}` : '';
}

interface Named {
  ref: string;
  name: string;
}

/** One week's files, numbered by where each picture or clip sits on the page, filled or not. */
function lessonNames(page: readonly PageBlock[], week: number): Named[] {
  const out: Named[] = [];
  let k = 0;
  const numbered = (ref: string, words: string, fallback: string) => {
    k += 1;
    if (isLocalMedia(ref)) out.push({ ref, name: `week-${week}-${k}-${slug(words) || fallback}${extension(ref)}` });
  };
  for (const b of page) {
    if (b.type === 'image') numbered(b.src, b.caption || b.alt || b.shows, 'picture');
    if (b.type === 'video') numbered(b.src, b.caption || b.alt || b.shows, 'video');
    if (b.type === 'steps') for (const s of b.items) if (s.shot) numbered(s.shot.src, s.shot.caption || s.shot.alt || s.shot.shows, 'picture');
    if (b.type === 'file' && isLocalMedia(b.href)) {
      const label = b.label.trim().replace(/[\\/:*?"<>|]+/g, '-');
      out.push({ ref: b.href, name: isFileName(label) ? label : `week-${week}-${slug(label) || 'file'}${extension(b.href)}` });
    }
  }
  return out;
}

/**
 * Each reference to something kept on the device, with its file name. Names are worked out over the whole
 * course, so a week exported alone names its files as the whole course does, and no two files share a name.
 */
export function mediaFileNames(course: Pick<Course, 'lessonOrder' | 'lessons'>): Map<string, string> {
  const names = new Map<string, string>();
  const taken = new Set<string>();
  course.lessonOrder.forEach((id, i) => {
    for (const { ref, name } of lessonNames(course.lessons[id]?.page ?? [], i + 1)) {
      if (names.has(ref)) continue;
      const dot = name.lastIndexOf('.');
      const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
      let unique = name;
      for (let n = 2; taken.has(unique.toLowerCase()); n += 1) unique = `${stem}-${n}${ext}`;
      taken.add(unique.toLowerCase());
      names.set(ref, unique);
    }
  });
  return names;
}

/** The folder of a zip export that holds them. */
export const MEDIA_FOLDER = 'media';
