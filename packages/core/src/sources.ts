import { newId } from './ids';
import type { Passage, Source } from './schema';

/** Split source text into paragraph passages that questions can cite. */
export function splitPassages(text: string): Passage[] {
  const passages: Passage[] = [];
  const re = /\S[\s\S]*?(?=\n\s*\n|$)/g;
  for (const match of text.matchAll(re)) {
    const start = match.index ?? 0;
    passages.push({ id: newId('p'), start, end: start + match[0].trimEnd().length });
  }
  return passages;
}

export function createSource(title: string, text: string, kind: Source['kind'] = 'text'): Source {
  const clean = text.replace(/\r\n?/g, '\n').trim();
  return { id: newId('s'), title, kind, text: clean, passages: splitPassages(clean), addedAt: new Date().toISOString() };
}

export function passageText(source: Source, passageId: string): string {
  const p = source.passages.find((x) => x.id === passageId);
  return p ? source.text.slice(p.start, p.end) : '';
}
