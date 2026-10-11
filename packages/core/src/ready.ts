import { lessonPieces } from './course';
import { docLabels, type DocLabels } from './docLabels';
import type { Course, Lesson } from './schema';

/**
 * What must be on hand before a lesson is taught, from what the lesson holds. A reading of twelve lessons found
 * calculators, forty quiz papers, a class list to score on and texts to copy that no page told the teacher to
 * prepare: each was in the plan somewhere, in the segment that used it. Gathered here in one list; nothing is added
 * that the lesson does not hold.
 */
export interface ReadyList {
  /** Sheets to copy, each with how many as its writer gave it. */
  copies: { title: string; copies: string }[];
  /** Graded papers sat in this lesson, not handed in online: one for every student. */
  papers: string[];
  /** Graded work scored during the meeting: the teacher marks against a list of the class. */
  scored: string[];
  /** What else the plan has someone use, as the sheets' writer listed it. */
  onHand: string[];
}

export function lessonReady(course: Course, lesson: Lesson): ReadyList {
  const card = (toward: string) => course.grading.find((g) => g.item.trim() === toward.trim())?.card;
  const pieces = lessonPieces(lesson).filter((p) => p.toward.trim());
  const titled = (toward: string) => lesson.taskIds.flatMap((id) => { const t = course.tasks[id]; return t?.kind === 'assignment' && t.toward.trim() === toward.trim() ? [t.title] : []; });
  return {
    copies: lesson.handouts.filter((h) => h.title.trim()).map((h) => ({ title: h.title, copies: h.copies })),
    papers: pieces.filter((p) => p.kind === 'test' && card(p.toward)?.handIn !== 'online').flatMap((p) => titled(p.toward)),
    scored: pieces.filter((p) => p.kind === 'inclass').map((p) => p.toward.trim()),
    onHand: (lesson.ready ?? []).map((x) => x.trim()).filter(Boolean),
  };
}

export const hasReady = (list: ReadyList) => list.copies.length + list.papers.length + list.scored.length + list.onHand.length > 0;

/** The list as the teacher reads it, a line a kind, in the course's language. */
export function readyLines(list: ReadyList, l: DocLabels = docLabels('en')): string[] {
  const q = (t: string) => `“${t}”`;
  return [
    ...(list.copies.length ? [l.readyCopies(list.copies.map((c) => `${q(c.title)}${c.copies.trim() ? ` (${c.copies.trim().replace(/\.$/, '')})` : ''}`).join('; '))] : []),
    ...(list.papers.length ? [l.readyPapers(list.papers.map(q).join('; '))] : []),
    ...(list.scored.length ? [l.readyScored(list.scored.map(q).join('; '))] : []),
    ...list.onHand,
  ];
}
