import { newId } from './ids';
import type { Passage, Source } from './schema';

/** A passage is a citable chunk: short paragraphs (headings, list items, table cells) join the next. */
const MIN_PASSAGE = 120;
const MAX_PASSAGE = 1200;

/** Split source text into paragraph passages that questions can cite. */
export function splitPassages(text: string): Passage[] {
  const passages: Passage[] = [];
  const re = /\S[\s\S]*?(?=\n\s*\n|$)/g;
  let open: { start: number; end: number } | null = null;
  for (const match of text.matchAll(re)) {
    const start = match.index ?? 0;
    const end = start + match[0].trimEnd().length;
    if (open && open.end - open.start < MIN_PASSAGE && end - open.start <= MAX_PASSAGE) {
      open.end = end;
      continue;
    }
    if (open) passages.push({ id: newId('p'), ...open });
    open = { start, end };
  }
  if (open) {
    const last = passages.at(-1);
    // A short tail joins the passage before it rather than standing alone.
    if (last && open.end - open.start < MIN_PASSAGE && open.end - last.start <= MAX_PASSAGE) last.end = open.end;
    else passages.push({ id: newId('p'), ...open });
  }
  return passages;
}

// eslint-disable-next-line no-control-regex -- control characters are exactly what is being removed.
const UNPRINTABLE = /[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu;

/**
 * Text as a file can carry it. A page break (from a PDF turned to text) becomes a paragraph break and Word's
 * soft line break a line break; other control characters and broken halves of a character go: Word and
 * PowerPoint refuse a file that holds one.
 */
export function cleanText(text: string): string {
  return text.replace(/\f/g, '\n\n').replace(/\v/g, '\n').replace(UNPRINTABLE, '');
}

export function createSource(title: string, text: string, kind: Source['kind'] = 'text'): Source {
  const clean = cleanText(text.replace(/\r\n?/g, '\n')).trim();
  return { id: newId('s'), title, kind, text: clean, passages: splitPassages(clean), addedAt: new Date().toISOString() };
}

export function passageText(source: Source, passageId: string): string {
  const p = source.passages.find((x) => x.id === passageId);
  return p ? source.text.slice(p.start, p.end) : '';
}
