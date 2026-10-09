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

const KINDS = ['short', 'worked', 'paragraph', 'read', 'pair', 'hear', 'vote', 'revote'] as const;

/** Minutes for one of each. */
// A question voted on once and explained is two minutes; talked over with neighbors and voted on again, three: three
// questions in six minutes were sound by every reader, and counted at three each they were sent to be cut.
const RATE: Record<(typeof KINDS)[number], number> = { short: 1, worked: 2, paragraph: 5, read: 2, pair: 2, hear: 1, vote: 2, revote: 3 };
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
  .max(8)
  .default([]);
export type SegmentParts = z.infer<typeof SegmentParts>;

/** Asked of the plan's reader, after the problems: a count, not a judgment. */
export const PARTS_ASK =
  'Then, apart from the problems, count under "parts" what each practice, check and discuss segment has every student do, as its description and notes say it, one entry for each kind of thing with how many: "short" an answer of a word, a number or a line, or a command typed and run; "worked" an answer with its working shown, or an output read and explained in a sentence; "paragraph" a paragraph, a drawing or a diagram made by hand; "read" a page read; "pair" one turn of telling, comparing or checking with a partner or another group; "hear" one student, pair or group heard by the class; "vote" one question voted on once and explained; "revote" one question voted on, talked over with neighbors, voted on again and explained, all in that one count. Count what the words ask for and do not judge the time.';

type ReviewNote = Extract<Flag, { code: 'reviewNote' }>;

/** Segments whose parts come to more than a quarter over their minutes, as notes for the mend: it cuts, the minutes stand. */
export function overtime(plan: Pick<PlanDraft, 'segments'>, counted: SegmentParts): ReviewNote[] {
  return counted.flatMap((c) => {
    const seg = plan.segments[c.segment - 1];
    if (!seg || !['practice', 'check', 'discuss'].includes(seg.kind) || !c.parts.length) return [];
    const need = c.parts.reduce((sum, p) => sum + p.count * RATE[p.kind], 0) + (c.parts.some((p) => p.kind === 'vote' || p.kind === 'revote') ? VOTING : 0);
    if (need <= 1.25 * seg.minutes) return [];
    const list = c.parts.map((p) => `${p.count} × ${p.what} (${p.count * RATE[p.kind]} min)`).join(', ');
    return [{ code: 'reviewNote' as const, values: { where: `Segment ${c.segment}, ${seg.title}`, text: `Counted by its parts this needs about ${Math.round(need)} minutes and has ${seg.minutes}: ${list}. Cut items or steps until it fits, here and in the notes that answer them; the minutes do not change.` } }];
  });
}
