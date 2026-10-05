import type { PageBlock } from '@folio/core';
import { z } from 'zod';

/**
 * An exhibit as the page's writer gives it: a document, a table or a page of notes the course itself wrote,
 * shown as what it is and not asked for as a picture of it.
 */

/** A block inside an exhibit, flat: the fields each kind uses are named in its description. */
export const ExhibitBlockDraft = z.object({
  type: z.enum(['heading', 'para', 'list', 'field', 'table', 'yours']).describe('heading: a label inside the exhibit. para: a paragraph. list: items. field: one labelled line, its label under "label" without a colon and what is written on it under "text" (empty for a line still to fill). table: columns and rows. yours: room for the student\'s own words, with a hint under "text"'),
  text: z.string().default('').describe('heading, para: the words. field: its value. table: a caption, or empty. yours: the hint'),
  label: z.string().default('').describe('field: its label'),
  items: z.array(z.string()).default([]).describe('list: the items'),
  columns: z.array(z.string()).default([]).describe('table: the column headings'),
  lines: z.number().int().min(1).max(24).default(3).describe('yours: how many lines of room the answer needs: 2 for a sentence, 6 for a worked problem, 10 for a drawing'),
  rows: z.array(z.array(z.string())).default([]).describe('table: the rows, each with one cell per column; an empty cell is an empty string'),
});

export const ExhibitDraft = z.object({
  frame: z.enum(['notes', 'document', 'plain']).default('plain').describe('"notes": the student\'s own working document as it should stand at this point. "document": a model document to study. "plain": a bare table or a comparison'),
  title: z.string().default('').describe('The document\'s own name at its top, or empty'),
  parts: z
    .array(z.object({ label: z.string().default('').describe('"Before", "After"; empty when there is one part'), blocks: z.array(ExhibitBlockDraft).min(1) }))
    .min(1)
    .max(2)
    .describe('One part; two only for things set side by side'),
  marks: z.array(z.object({ quote: z.string().min(1).describe('The exact words in the exhibit to outline: a column\'s heading for the whole column, a row\'s first cell for the whole row'), note: z.string().min(1).describe('What to notice there') })).max(8).default([]).describe('Only what the page points at; usually none'),
  reveal: z.boolean().default(false).describe('true when it shows what the student is about to write or work out: it then stays closed until they open it to compare'),
});
export type ExhibitDraft = z.infer<typeof ExhibitDraft>;

type ExhibitPart = Extract<PageBlock, { type: 'exhibit' }>['parts'][number];

/** An exhibit's block as the page keeps it: a table's rows made as long as its columns, whatever came. */
export function exhibitPart(p: ExhibitDraft['parts'][number]): ExhibitPart {
  const blocks = p.blocks.map((x): ExhibitPart['blocks'][number] => {
    if (x.type === 'heading' || x.type === 'para') return { type: x.type, text: x.text };
    if (x.type === 'list') return { type: 'list', ordered: false, items: x.items };
    // A label is given once and without its colon, which the page adds: "Name: Name:" was printed.
    if (x.type === 'field') {
      const label = x.label.trim().replace(/[:：]\s*$/, '');
      return { type: 'field', label, value: x.text.trim().replace(/[:：]\s*$/, '') === label ? '' : x.text };
    }
    if (x.type === 'yours') return { type: 'yours', hint: x.text, lines: x.lines };
    return { type: 'table', columns: x.columns, rows: x.rows.map((r) => x.columns.map((_, i) => r[i] ?? '')), caption: x.text };
  });
  return { label: p.label, blocks };
}

/** What is wrong with an exhibit's form, each as the writer can put it right. */
export function exhibitFaults(exhibit: ExhibitDraft | undefined): string[] {
  if (!exhibit) return ['has nothing in it: give the document, table or notes page under "exhibit"'];
  const blocks = exhibit.parts.flatMap((p) => p.blocks);
  const words = [exhibit.title, ...blocks.flatMap((x) => [x.text, x.label, ...x.items, ...x.columns, ...x.rows.flat()])].join('\n');
  const out: string[] = [];
  if (blocks.some((x) => x.type === 'table' && (!x.columns.length || x.rows.some((r) => r.length !== x.columns.length)))) out.push('has a table whose rows are not as long as its columns: give every row one cell for each column, empty cells as empty strings');
  if (blocks.some((x) => x.type === 'list' && x.items.some((i) => i.includes(' | ')))) out.push('has a table written as a list with bars: give it as a table');
  if (/(^|\s)(\.\.\.|…)(\s|$)/m.test(words)) out.push('stands in "…" for content: write what is there');
  const lost = exhibit.marks.filter((m) => !words.includes(m.quote));
  if (lost.length) out.push(`points at words that are not in it ("${lost[0]!.quote.slice(0, 40)}"): quote them exactly as the exhibit has them`);
  const twice = exhibit.marks.find((m) => words.split(m.quote).length > 2);
  if (twice) out.push(`points at words that occur more than once in it ("${twice.quote.slice(0, 40)}"): quote enough of them to occur once`);
  return out;
}


/** An exhibit as a reader of the page is shown it: what kind it is, then its words, tables with bars between cells. */
export function exhibitDraftText(e: ExhibitDraft): string {
  const block = (x: ExhibitDraft['parts'][number]['blocks'][number]): string => {
    if (x.type === 'table') return [x.columns.join(' | '), ...x.rows.map((r) => r.join(' | ')), x.text].filter(Boolean).join('\n');
    if (x.type === 'list') return x.items.map((i) => `- ${i}`).join('\n');
    if (x.type === 'field') return `${x.label}: ${x.text}`;
    return x.type === 'yours' ? `(room for the student's own: ${x.text})` : x.text;
  };
  const parts = e.parts.map((p) => [p.label && `${p.label}:`, ...p.blocks.map(block)].filter(Boolean).join('\n'));
  const marks = e.marks.map((m) => `  [points at "${m.quote}"] ${m.note}`);
  return [`[exhibit: ${e.frame}${e.reveal ? ', closed until the student opens it' : ''}] ${e.title}`.trim(), ...parts, ...marks].join('\n');
}
