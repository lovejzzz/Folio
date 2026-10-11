import { cmd, hasModulePages, newId, type Command, type Course, type Lesson } from '@folio/core';
import { z } from 'zod';
import { InferenceError, type Inference } from './inference';
import { runJob } from './jobs';
import { courseBackground, lessonContext, onlyThese, systemPrompt } from './prompts';

/**
 * A lesson's facts, where no lesson plan holds them. Writers working without a plan each made the lesson up from its
 * title: a deck and a quiz on the same factory closing explained it two ways, and the deck's key gave "she had no
 * savings" as a reason a worker lost her job. Before anything else is written for such a lesson, its key ideas, its
 * terms and a few cases are settled once, each case with what is given, what is asked, the answer and what the case
 * does not show; every writer is then given the same account, and so is one added later. It is a short step, not a
 * plan: no segments, no minutes, no sheets, nothing a teacher is handed.
 */
const line = z.string().min(1);

export const FactsDraft = z.object({
  keyIdeas: z.array(line).min(2).max(5).describe('What the lesson teaches, a sentence each'),
  vocabulary: z.array(z.object({ term: line, definition: line })).max(8),
  cases: z
    .array(
      z.object({
        title: line.describe('A few words to call it by'),
        known: line.describe('Everything that is given: the situation, the numbers, the document, in full. Nothing is known of the case that is not written here'),
        question: line.describe('The one question the case is used to ask'),
        answer: line.describe('The answer, reasoned only from what is given and what the lesson teaches'),
        notShown: z.string().default('').describe('What the case does not show and a hasty answer would claim: a cause that is not given, a motive, a number that was not measured. Empty when there is nothing of the kind'),
      }),
    )
    .min(2)
    .max(4)
    .describe('The cases, examples or problems the lesson works with: every material written for the lesson takes its cases from these'),
});
export type FactsDraft = z.infer<typeof FactsDraft>;

/** Whether a lesson has an account of its own to write from: a plan, or its facts settled without one. */
export const hasFacts = (lesson: Lesson): boolean => lesson.segments.length > 0 || (lesson.page?.length ?? 0) > 0 || lesson.cases.length > 0;

/** A course whose lessons are written without a plan, and so need their facts settled first. */
export const needsFacts = (course: Course, lesson: Lesson): boolean => !hasModulePages(course) && !course.materials.plan.enabled && !hasFacts(lesson);

export function factsPrompt(course: Course, lesson: Lesson): string {
  return [
    lessonContext(course, lesson),
    onlyThese(course),
    'No lesson plan is written for this course. Before the materials above are written, settle what this lesson teaches, once, so that each of them says the same: its key ideas, the terms students need, and two to four cases (examples, problems, documents, sets of numbers) that the lesson is taught and practised with. A case is whole: what is given is written out in full, and its answer follows from what is given and from the lesson, with its working where it has any. Say of each case what it does not show: where a case gives an event and its effects, the answer does not name causes the case never gave; where it gives numbers, the answer claims nothing they do not support. Write nothing of how a meeting is run: no steps, no minutes, no handouts.',
  ].filter(Boolean).join('\n\n');
}

/** The command that settles one lesson's facts. Throws when they could not be had: nothing is written from a guess. */
export async function lessonFacts(inference: Inference, course: Course, lessonId: string, signal?: AbortSignal): Promise<Command[]> {
  const lesson = course.lessons[lessonId];
  if (!lesson) throw new InferenceError('invalid', 'No such lesson.');
  const { value } = await runJob(inference, { task: 'folio_facts', system: systemPrompt(course.language, course.locale), context: courseBackground(course), prompt: factsPrompt(course, lesson), effort: 'medium', schema: FactsDraft, signal });
  return [cmd('lesson.facts', { lessonId, keyIdeas: value.keyIdeas, vocabulary: value.vocabulary.map((t) => ({ ...t, id: newId('x') })), cases: value.cases.map((c) => ({ ...c, id: newId('x') })) })];
}

/** The lesson's facts as every writer is given them, in place of a plan. */
export function factsSummary(lesson: Lesson): string {
  if (!lesson.cases.length) return '';
  const cases = lesson.cases.map((c, i) => `Case ${i + 1}, ${c.title}\n  Given: ${c.known}\n  Asked: ${c.question}\n  Answer: ${c.answer}${c.notShown.trim() ? `\n  Not shown by the case, and never claimed: ${c.notShown.trim()}` : ''}`);
  const terms = lesson.vocabulary.map((t) => `${t.term}: ${t.definition}`);
  return [
    'There is no lesson plan. What this lesson teaches was settled once, for every material written for it:',
    lesson.keyIdeas.map((k) => `- ${k}`).join('\n'),
    terms.length ? `Terms: ${terms.join('; ')}` : '',
    cases.join('\n\n'),
    'Where your material uses a case, an example or numbers, they are these, as given, with these answers and no cause, motive or figure the case does not give. A further example of your own agrees with them. Nothing here is a thing students or the teacher hold: it is not named or referred to.',
  ].filter(Boolean).join('\n\n');
}
