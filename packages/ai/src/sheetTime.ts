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
}

interface Sheet {
  title: string;
  usedIn: string;
  blocks: Block[];
}

/** Minutes a student needs to write one answer: a line or two is a short answer, a worked one more, a paragraph or a drawing most. */
const answer = (lines: number): number => (lines <= 2 ? 1 : lines <= 7 ? 2 : 5);

/** Minutes of writing a sheet asks for: its answer rooms, its blank fields, the empty cells of its tables. */
export function sheetMinutes(sheet: Sheet): number {
  return sheet.blocks.reduce((sum, b) => {
    if (b.type === 'yours') return sum + answer(b.lines ?? 3);
    if (b.type === 'field') return sum + (b.text?.trim() ? 0 : 0.5);
    if (b.type === 'table') return sum + 0.25 * (b.rows ?? []).flat().filter((cell) => !cell.trim()).length;
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
