/**
 * A sheet against the minutes of the segment that uses it. Plans add up to the meeting, and the sheets written
 * from them were sized by what the lesson covers: four cases with three answers each, to be written, compared and
 * heard in eleven minutes. Readers counted these by parts and found them the commonest thing that stops a lesson
 * (4 of 11 on one whole reading). Counted the same way here, before a sheet is kept.
 */

interface Block {
  type: string;
  text?: string;
  lines?: number;
  rows?: string[][];
  columns?: string[];
  label?: string;
  value?: string;
}

interface Sheet {
  title: string;
  usedIn: string;
  blocks: Block[];
}

/** Minutes a student needs to write one answer: a line or two is a short answer, a worked one more, a paragraph or a drawing most. */
const answer = (lines: number): number => (lines <= 2 ? 1 : lines <= 7 ? 2 : 5);

/**
 * What a heading asks for, by its own form: a question, or a heading of four words or more ("What was true before? What
 * after?", "Our reason, citing the passage"), is answered in a sentence; "Place", "Age", "Design" in a word or a number.
 * An organizer of six rows under three questions was counted as forty-two quick cells, four minutes and a half, and
 * passed for a segment of twelve; readers counted eighteen short answers and twenty-seven minutes.
 */
const sentence = (heading: string): boolean => heading.includes('?') || heading.trim().split(/\s+/).length >= 4;

function tableMinutes(b: Block): number {
  const rows = b.rows ?? [];
  // Without named columns, a first row that is full is the headings.
  const heads = b.columns?.length ? b.columns : rows[0]?.every((cell) => cell.trim()) ? rows[0] : [];
  return rows.reduce((sum, row) => sum + row.reduce((n, cell, i) => n + (cell.trim() ? 0 : sentence(heads[i] ?? '') ? 1 : 0.25), 0), 0);
}

/** Minutes of writing a sheet asks for: its answer rooms, its blank fields, the empty cells of its tables. */
export function sheetMinutes(sheet: Sheet): number {
  return sheet.blocks.reduce((sum, b) => {
    if (b.type === 'yours') return sum + answer(b.lines ?? 3);
    if (b.type === 'field') return sum + ((b.value ?? b.text)?.trim() ? 0 : sentence(b.label ?? '') ? 1 : 0.5);
    if (b.type === 'table') return sum + tableMinutes(b);
    return sum;
  }, 0);
}

/** What a segment's minutes leave for writing, once students have compared and a few have been heard. */
const room = (minutes: number): number => Math.max(1, minutes - 2);

export interface Overfull {
  segment: string;
  minutes: number;
  asked: number;
  sheets: string[];
}

/** The segments whose sheets ask more than a quarter over what their minutes hold. */
export function overfull(sheets: Sheet[], segments: { title: string; minutes: number }[]): Overfull[] {
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  return segments.flatMap((seg) => {
    const used = sheets.filter((s) => same(s.usedIn, seg.title));
    const asked = used.reduce((n, s) => n + sheetMinutes(s), 0);
    return used.length && asked > 1.25 * room(seg.minutes) ? [{ segment: seg.title, minutes: seg.minutes, asked: Math.round(asked), sheets: used.map((s) => s.title) }] : [];
  });
}

/** Said to the sheets' writer, who cuts items: the plan's minutes stand. */
export const overfullNote = (over: Overfull[]): string =>
  over.map((o) => `${o.sheets.map((t) => `"${t}"`).join(' and ')} ask${o.sheets.length > 1 ? '' : 's'} for about ${o.asked} minutes of writing in "${o.segment}", which has ${o.minutes} and also has students compare and report: cut items, parts or rows (keeping the ones the lesson turns on) until what is left can be written in about ${Math.round(room(o.minutes))} minutes; do not shorten the room an answer needs`).join('; ');
