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
    const text = `The sheet students are handed here was shortened to fit the segment's ${o.minutes} minutes, and the plan still tells of the longer one. Write this segment's description and notes to the sheet as it now stands: the same items under the same labels, the same number of them, and answers to those and no others. The minutes do not change. The sheet:\n${JSON.stringify(now.map((s) => ({ title: s.title, blocks: s.blocks })))}`;
    return [{ code: 'reviewNote' as const, values: { where: o.segment, text } }];
  });
  if (!notes.length) return plan;
  const mended = await mendPlan(inference, course, lesson, plan as unknown as PlanDraft, notes, signal);
  // Only the segments the sheets belong to: a mend that reached further is not what was asked.
  const mine = new Set(cut.map((o) => o.segment.trim().toLowerCase()));
  const segments = plan.segments.map((s, i) => (mine.has(s.title.trim().toLowerCase()) && mended.value.segments[i] ? { ...s, description: mended.value.segments[i].description, teacherNotes: mended.value.segments[i].teacherNotes } : s));
  return { ...plan, segments };
}
