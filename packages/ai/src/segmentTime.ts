import type { Flag } from '@folio/core';
import { z } from 'zod';
import type { PlanDraft } from './schemas';

/**
 * A segment's minutes against what it has students do, counted by parts. Plans add up to the meeting and say "count
 * the minutes by its parts", and one in five did not: three problems worked alone, compared in pairs and three heard,
 * in nine minutes. Where a sheet is handed out its answer rooms are counted (sheetTime); here the reader of the plan
 * counts what the words ask for and the sum is done in code, by the rates the readers of finished lessons use, so the
 * model measures and does not judge.
 */

const KINDS = ['short', 'worked', 'paragraph', 'drawing', 'listed', 'read', 'pair', 'hear', 'scored', 'vote', 'revote'] as const;

/** Minutes for one of each. */
// A question voted on once and explained is two minutes; talked over with neighbors and voted on again, three: three
// questions in six minutes were sound by every reader, and counted at three each they were sent to be cut. A drawing
// is two minutes, not a paragraph's five (five shell diagrams came to twenty-five minutes, and the practice was cut to
// one atom); an item of a list half a minute; a pair heard and given a score a minute and a half.
const RATE: Record<(typeof KINDS)[number], number> = { short: 1, worked: 2, paragraph: 5, drawing: 2, listed: 0.5, read: 2, pair: 2, hear: 1, scored: 1.5, vote: 2, revote: 3 };
/** Once in a segment that votes: the question put up, the devices out, everyone seen to have answered. */
const VOTING = 1;

export const SegmentParts = z
  .array(
    z.object({
      segment: z.number().int().min(1).describe('The segment\'s number'),
      parts: z
        .array(z.object({ what: z.string().describe('What it is, in a few words'), kind: z.enum(KINDS), count: z.number().int().min(1).max(60) }))
        .max(8)
        .default([]),
    }),
  )
  // As many as a plan has segments: at eight, the count of a week of two meetings was refused and asked for again.
  .max(24)
  .default([]);
export type SegmentParts = z.infer<typeof SegmentParts>;

/** Asked of the plan's reader, after the problems: a count, not a judgment. */
export const PARTS_ASK =
  'Then, apart from the problems, count under "parts" what each segment (a break aside) has every student do, as its description and notes say it, one entry for each kind of thing with how many: "short" an answer of a word, a number or a line, or a command typed and run; "worked" an answer with its working shown, or an output read and explained in a sentence; "paragraph" a paragraph written; "drawing" a diagram, sketch or graph drawn by hand; "listed" one item of a list of things named; "read" a page read; "pair" one turn of telling, comparing or checking with a partner or another group; "hear" one student, pair or group heard by the class; "scored" one student or pair heard and given a score; "vote" one question voted on once and explained; "revote" one question voted on, talked over with neighbors, voted on again and explained, all in that one count. A segment in which the teacher only presents has no parts. Count what the words ask for and do not judge the time.';

type ReviewNote = Extract<Flag, { code: 'reviewNote' }>;

/** Between what is so and what the mend is to do about it: the first is for the teacher too, the second for the writer alone. */
export const FOR_WRITER = ' To fit: ';
/** A note as a teacher reads it, when the mend did not bring the segment down. */
export const forTeacher = (text: string): string => (text.includes(FOR_WRITER) ? `${text.split(FOR_WRITER)[0]} Cut a part of it, or give it more minutes.` : text);

/** Segments whose parts come to more than a quarter over their minutes, as notes for the mend: it trims, within a floor, and the minutes stand. */
export function overtime(plan: Pick<PlanDraft, 'segments'>, counted: SegmentParts, again = false): ReviewNote[] {
  return counted.flatMap((c) => {
    const seg = plan.segments[c.segment - 1];
    if (!seg || seg.kind === 'break' || !c.parts.length) return [];
    const need = c.parts.reduce((sum, p) => sum + p.count * RATE[p.kind], 0) + (c.parts.some((p) => p.kind === 'vote' || p.kind === 'revote') ? VOTING : 0);
    // Read again after its mend, a segment still a little over is let be: trimmed within the floor it will not come lower,
    // and "needs 8 minutes and has 6" is no note for a teacher.
    if (need <= (again ? 1.5 : 1.25) * seg.minutes) return [];
    const list = c.parts.map((p) => `${p.count} × ${p.what} (${p.count * RATE[p.kind]} min)`).join(', ');
    // How to cut, and how far: cut to a count that ran high, a practice came back as one atom, "find four faults" with
    // three, a discussion without its rounds and its close. Readers then preferred the plans as first written, 16 to 10.
    const over = need / seg.minutes;
    const how = over < 1.5 ? 'It is under half over: keep every item and ask less of each (drop a sub-part, a second sentence, a repeat), and say in the description what each item now asks.' : 'Ask less of each item first, and only then take items out.';
    const floor = `${seg.kind === 'discuss' ? 'A discussion keeps its questions, its rounds and its close: shorten the writing and the number heard. ' : ''}Whatever is cut, at least three items stay in a practice, at least one for each key idea the segment serves, and a number said anywhere of the items ("four statements") is made to fit.`;
    return [{ code: 'reviewNote' as const, values: { where: `Segment ${c.segment}, ${seg.title}`, text: `Counted by its parts this needs about ${Math.round(need)} minutes and has ${seg.minutes}: ${list}.${FOR_WRITER}Bring it to about ${seg.minutes} minutes of work, here and in the notes that answer it; the minutes do not change. ${how} ${floor}` } }];
  });
}
