import { lessonPieces, orderedLessons, type Course, type Lesson } from '@folio/core';
import type { PlanDraft } from './schemas';

/**
 * A test sat at the next lesson, said in the plan's close when the plan does not say it. Told to announce it, a plan closed
 * on "next time extends the comparison"; sent to the mend, it came back the same, and the first quiz of a course opened a
 * class nobody had warned. Where the next lesson's test is known, the sentence is Folio's own, added to the last segment.
 */
export function announced(v: PlanDraft, course: Course, lesson: Lesson): PlanDraft {
  const next = orderedLessons(course)[course.lessonOrder.indexOf(lesson.id) + 1];
  const test = next ? lessonPieces(next).find((p) => p.kind === 'test' && p.toward.trim()) : undefined;
  if (!test || course.language !== 'en') return v;
  const named = test.toward.trim().toLowerCase();
  // In one sentence: "a practice quiz on this lesson" beside "next time extends the comparison" announced nothing.
  const sentences = v.segments.flatMap((x) => `${x.description}\n${x.teacherNotes}`.toLowerCase().split(/(?<=[.!?])\s+|\n+/));
  // (or, in a course of several meetings a lesson, names the lesson the test is sat at: "next time" is this lesson's own next meeting)
  const soon = (x: string) => /\bnext (?:time|class|lesson|week|meeting|session)\b/.test(x) || (course.shape.sessions.length > 1 && x.includes(next!.title.toLowerCase()));
  if (sentences.some((x) => soon(x) && (/\b(?:quiz(?:zes)?|tests?|exams?|midterms?|final)\b/.test(x) || x.includes(named)))) return v;
  // By its component and no more: named by its paper's title, which carried the lesson it is sat in, a quiz on lists was
  // announced as covering stacks and queues; said to be "on what the course has taught up to today", a weekly quiz that
  // is on next week's lectures was announced wrongly the other way. What it covers is the plan's and the paper's to say.
  const sat = `a graded test ("${test.toward.trim()}")`;
  const last = v.segments.findLastIndex((x) => x.kind !== 'break');
  if (last < 0) return v;
  // Said as "next time" at the end of a recitation, the quiz was a week off and the next meeting a lecture: a lesson of several meetings names the lesson.
  const when = course.shape.sessions.length > 1 ? `at "${next!.title}"` : 'next time';
  return { ...v, segments: v.segments.map((x, i) => (i === last ? { ...x, description: `${x.description.trimEnd()}\nBefore students leave, tell them that ${when} they sit ${sat}.` } : x)) };
}
