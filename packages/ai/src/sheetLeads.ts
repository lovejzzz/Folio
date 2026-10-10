import type { Course, Lesson } from '@folio/core';
import type { Inference } from './inference';
import { mendPlan } from './mend';
import type { PlanDraft } from './schemas';
import type { Overfull } from './sheetTime';

/**
 * A sheet cut to its minutes, and the plan that still tells of the longer one. Sheets that asked more than their
 * segment held were written again shorter, and the plan kept its list: a sheet of four items stood beside notes and
 * slides for six, and the answers read aloud were to items nobody had (two lessons could not be taught as written,
 * of thirty-two read). The plan's account of the segment is written again from the sheet as it stands, so the slides
 * and everything else written from the plan follow the sheet.
 */

interface Sheet {
  title: string;
  usedIn: string;
  blocks: unknown[];
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export async function sheetLeads<P extends Pick<PlanDraft, 'segments' | 'keyIdeas' | 'vocabulary'>>(inference: Inference, course: Course, lesson: Lesson, plan: P, sheets: Sheet[], cut: Overfull[], signal?: AbortSignal): Promise<P> {
  const notes = cut.flatMap((o) => {
    const now = sheets.filter((s) => same(s.usedIn, o.segment));
    if (!now.length) return [];
    const text = `The sheet students are handed here was shortened to fit the segment's ${o.minutes} minutes, and the plan still tells of the longer one. Write this segment again, its description, what it puts on the screen and its teacher's notes, to the sheet as it now stands: the same items under the same labels, the same number of them, and answers to those and no others. The minutes do not change. The sheet:\n${JSON.stringify(now.map((s) => ({ title: s.title, blocks: s.blocks })))}`;
    return [{ code: 'reviewNote' as const, values: { where: o.segment, text } }];
  });
  if (!notes.length) return plan;
  // Only the segments the sheets belong to: a mend that reached further is not what was asked.
  const mine = new Set(cut.map((o) => o.segment.trim().toLowerCase()));
  const taken = (from: PlanDraft, into: P): P => ({ ...into, segments: into.segments.map((s, i) => (mine.has(s.title.trim().toLowerCase()) && from.segments[i] ? { ...s, description: from.segments[i].description, teacherNotes: from.segments[i].teacherNotes, ...(from.segments[i].shown ? { shown: from.segments[i].shown } : {}) } : s)) });
  const first = taken((await mendPlan(inference, course, lesson, plan as unknown as PlanDraft, notes, signal)).value, plan);
  // The description came back for four cases A to D and the notes still answered five, 1 to 5: notes left word for word
  // beside a description that changed are asked for once more, by name.
  const stale = first.segments.filter((s, i) => mine.has(s.title.trim().toLowerCase()) && s.teacherNotes.trim() && s.teacherNotes === plan.segments[i]!.teacherNotes && s.description !== plan.segments[i]!.description);
  if (!stale.length) return first;
  const again = stale.map((s) => ({ code: 'reviewNote' as const, values: { where: s.title, text: `This segment's description now follows the shortened sheet, and its teacher's notes still tell of the longer one. Write the notes again to the sheet as it stands: its items under its labels, as many as it has, and the answers to those and no others. ${notes.find((n) => same(n.values.where, s.title))?.values.text.split('The sheet:')[1] ? `The sheet:${notes.find((n) => same(n.values.where, s.title))!.values.text.split('The sheet:')[1]}` : ''}` } }));
  return taken((await mendPlan(inference, course, lesson, first as unknown as PlanDraft, again, signal).catch(() => ({ value: first as unknown as PlanDraft }))).value, first);
}
