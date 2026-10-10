/**
 * Where in a book or on the web a material sends its reader: a chapter, a dotted section, pages, an address. Writers give
 * these from memory, and of those readers looked up about half were wrong (a section left out that the problems need, "2.1"
 * for 2.2, a chapter's name, a reader with no page numbers cited by page). A student who follows a wrong one reads the wrong
 * thing. One that stands in the teacher's own brief or files is the teacher's; any other is found here, so it can be kept
 * out of what students are handed and put before the teacher to confirm. A bare "Section 8" or "page 2" is a part of the
 * document in hand (a safety sheet, the worksheet) as often as a place in a book, and is left alone.
 */

const LOCATOR = /\b(?:chapters?|chs?\.)\s*\d+(?:\.\d+)*(?:\s*(?:[-–]|and|to|,)\s*\d+(?:\.\d+)*)*|(?:\bsections?|\bsecs?\.|§)\s*\d+\.\d+(?:\.\d+)?(?:\s*(?:[-–]|and|to|,)\s*\d+\.\d+)*|\bpp?\.\s*\d+(?:\s*[-–]\s*\d+)?|\bpages\s+\d+\s*[-–]\s*\d+|https?:\/\/[^\s)"'<>\]]+|\bwww\.[^\s)"'<>\]]+/gi;

const plain = (text: string) => text.toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ');

/** The locators in a text that the teacher's brief and files do not hold, each as it is written. */
export function unsourcedLocators(text: string, grounds: string): string[] {
  const held = plain(grounds);
  return [...new Set([...text.matchAll(LOCATOR)].map((m) => m[0].replace(/[.,;:]+$/, '')).filter((found) => !held.includes(plain(found))))];
}

/** Said after a locator nobody has confirmed, where students read it too. */
export const TO_CONFIRM = '(to confirm)';

/**
 * The text with each such locator marked. The number stays, since it is right about half the time and a teacher confirms
 * one in seconds; the mark tells a student it is not yet the teacher's word, and gives the teacher something to find.
 */
export function withUnsourcedMarked(text: string, grounds: string): string {
  return unsourcedLocators(text, grounds).reduce((now, found) => now.split(found).map((part, i, all) => (i < all.length - 1 && !all[i + 1]!.startsWith(` ${TO_CONFIRM}`) ? `${part}${found} ${TO_CONFIRM}` : i < all.length - 1 ? `${part}${found}` : part)).join(''), text);
}

/** Fields only the teacher reads: a locator there is the teacher's to weigh, and is listed for them, not marked. */
const TEACHERS = new Set(['notes', 'teacherNotes', 'answerKey', 'key', 'followUps']);

/** A draft with the unsourced locators marked in everything students are given. */
export function markedForStudents<T>(value: T, grounds: string): T {
  const walk = (v: unknown, k = ''): unknown => {
    if (TEACHERS.has(k)) return v;
    if (typeof v === 'string') return withUnsourcedMarked(v, grounds);
    if (Array.isArray(v)) return v.map((x) => walk(x, k));
    return v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([key, x]) => [key, walk(x, key)])) : v;
  };
  return walk(value) as T;
}

/** What a course's teacher gave: the brief and the files. */
export const groundsOf = (course: { brief: string; sources: Record<string, { title: string; text: string }> }): string => [course.brief, ...Object.values(course.sources).flatMap((s) => [s.title, s.text])].join('\n');
