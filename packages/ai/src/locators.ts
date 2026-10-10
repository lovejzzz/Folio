/**
 * Where in a book or on the web a material sends its reader: a chapter, a dotted section, pages, an address. Writers give
 * these from memory, and of those readers looked up about half were wrong (a section left out that the problems need, "2.1"
 * for 2.2, a chapter's name, a reader with no page numbers cited by page). A student who follows a wrong one reads the wrong
 * thing. One that stands in the teacher's own brief or files is the teacher's; any other is found here, so it can be kept
 * out of what students are handed and put before the teacher to confirm. A bare "Section 8" or "page 2" is a part of the
 * document in hand (a safety sheet, the worksheet) as often as a place in a book, and is left alone.
 */

const LOCATOR = /\b(?:chapters?|chs?\.)\s*\d+(?:\s*(?:[-–]|and|to|,)\s*\d+)*|(?:\bsections?|\bsecs?\.|§)\s*\d+\.\d+(?:\.\d+)?(?:\s*(?:[-–]|and|to|,)\s*\d+\.\d+)*|\bpp?\.\s*\d+(?:\s*[-–]\s*\d+)?|\bpages\s+\d+\s*[-–]\s*\d+|https?:\/\/[^\s)"'<>\]]+|\bwww\.[^\s)"'<>\]]+/gi;

const plain = (text: string) => text.toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ');

/** What a locator is, for the words that stand in its place. */
function sort(found: string): 'chapter' | 'section' | 'pages' | 'link' {
  if (/^(?:https?:|www\.)/i.test(found)) return 'link';
  if (/^ch/i.test(found)) return 'chapter';
  return /^(?:sec|§)/i.test(found) ? 'section' : 'pages';
}

/** The locators in a text that the teacher's brief and files do not hold, each as it is written. */
export function unsourcedLocators(text: string, grounds: string): string[] {
  const held = plain(grounds);
  return [...new Set([...text.matchAll(LOCATOR)].map((m) => m[0].replace(/[.,;:]+$/, '')).filter((found) => !held.includes(plain(found))))];
}

/** The text with each such locator replaced by a place for the teacher to fill: "(chapter to confirm)". */
export function withoutUnsourced(text: string, grounds: string): string {
  const out = unsourcedLocators(text, grounds);
  return out.reduce((now, found) => now.split(found).join(`(${sort(found)} to confirm)`), text);
}
