import { lessonObjectives } from './course';
import type { Choice, Course, Criterion, Discussion, FaqEntry, Lesson, Objective, Question, Segment, StudyPoint, Term } from './schema';

/**
 * "Blank" items: added with an Add button and never written. The editor
 * takes them out again when focus leaves them; ripple and every projection
 * ignore them, so nothing empty is ever printed or exported.
 */

const blank = (text: string): boolean => text.trim().length === 0;

export const isBlankText = blank;

export function isBlankObjective(o: Objective): boolean {
  return blank(o.text);
}

export function isBlankSegment(s: Segment): boolean {
  return blank(s.title) && blank(s.description) && blank(s.teacherNotes);
}

export function isBlankTerm(t: Term): boolean {
  return blank(t.term) && blank(t.definition);
}

export function isBlankPoint(p: StudyPoint): boolean {
  return blank(p.heading) && blank(p.explanation);
}

export function isBlankQuestion(q: Question): boolean {
  return blank(q.prompt) && blank(q.answer) && blank(q.explanation) && q.choices.every((c) => blank(c.text));
}

export function isBlankDiscussion(d: Discussion): boolean {
  return blank(d.prompt) && d.followUps.every(blank);
}

export function isBlankFaq(f: FaqEntry): boolean {
  return blank(f.question) && blank(f.answer);
}

export function isBlankCriterion(c: Criterion): boolean {
  return blank(c.name) && Object.values(c.descriptors).every(blank);
}

/** A lesson with nothing in it at all: no title, summary, objectives or content. */
export function isBlankLesson(course: Course, lesson: Lesson): boolean {
  return (
    blank(lesson.title) &&
    blank(lesson.summary) &&
    lessonObjectives(course, lesson).every(isBlankObjective) &&
    lesson.taskIds.length === 0 &&
    lesson.faqIds.length === 0 &&
    lesson.segments.length === 0 &&
    lesson.keyIdeas.length === 0 &&
    lesson.vocabulary.length === 0 &&
    lesson.slides.length === 0 &&
    lesson.study.points.length === 0 &&
    blank(lesson.study.overview) &&
    Object.keys(lesson.gen).length === 0
  );
}

/** The objectives a lesson actually states: blank ones are still being written. */
export function statedObjectives(course: Course, lesson: Lesson): Objective[] {
  return lessonObjectives(course, lesson).filter((o) => !isBlankObjective(o));
}

/** Short texts (key ideas, steps, follow-ups) that have something in them. */
export function filledTexts(items: readonly string[]): string[] {
  return items.filter((x) => !blank(x));
}

/** The question as printed: without blank choices, so letters and the answer key still agree. */
export function withoutBlankChoices(q: Question): Question {
  if (q.choices.every((c: Choice) => !blank(c.text))) return q;
  const choices = q.choices.filter((c) => !blank(c.text));
  return { ...q, choices, correct: choices.some((c) => c.id === q.correct) ? q.correct : null };
}
