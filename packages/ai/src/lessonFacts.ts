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

/** A second reader's finding: for each case, what its answer states as fact that nothing given supports. */
export const FactsCheck = z.object({
  cases: z.array(z.object({ n: z.number().int().min(1).describe('The case, counted from 1'), unsupported: z.array(line).max(6).describe('Each statement of fact in the answer that is not in what is given and does not follow from it or from what the lesson teaches: copied from the answer, a few words each. Empty when there is none') })),
});

/**
 * What the answers claim beyond what the cases give, read by a second reader that did not write them. One writer
 * filling in "what the case does not show" settled nothing: a case that gave a plant closing and 600 jobs lost had an
 * answer that said the town "offers few similar jobs, so 600 people compete for a small number of openings", which
 * nothing given said. A statement of the lesson's own teaching (a definition, a law, a method) is not a claim of the case.
 */
export function factsCheckPrompt(course: Course, lesson: Lesson, v: FactsDraft): string {
  const cases = v.cases.map((c, i) => `Case ${i + 1}, ${c.title}\nGiven: ${c.known}\nAsked: ${c.question}\nAnswer: ${c.answer}`).join('\n\n');
  return [
    lessonContext(course, lesson),
    `What the lesson teaches:\n${v.keyIdeas.map((k) => `- ${k}`).join('\n')}`,
    cases,
    'Read each answer against what its case gives, as a careful examiner would. List every statement in the answer that says something is so about the case (a number, a cause, a circumstance, how many jobs or people or units there are, what someone did or will do) when that is neither written under "Given" nor follows from it by the lesson\'s own reasoning or by arithmetic. A definition, a law or a method the lesson teaches is not such a statement, and neither is one the answer marks as a possibility ("may", "one would need to know"). Copy the words from the answer.',
  ].join('\n\n');
}

async function unsupportedIn(inference: Inference, course: Course, lesson: Lesson, v: FactsDraft, signal?: AbortSignal): Promise<string[][]> {
  const { value } = await runJob(inference, { task: 'folio_facts_check', system: 'You check course materials. Reply with one JSON object and nothing else.', context: courseBackground(course), prompt: factsCheckPrompt(course, lesson, v), effort: 'medium', schema: FactsCheck, signal });
  return v.cases.map((_, i) => value.cases.find((c) => c.n === i + 1)?.unsupported ?? []);
}

/**
 * The command that settles one lesson's facts: written, read by a second reader for what the answers claim beyond what
 * is given, written once more with those claims named when there are any, and read again. What is still claimed
 * without support after that is kept on the case as such: writers are told not to state it, and the teacher is told
 * it is there. Throws when the facts could not be had, or could not be read: nothing is written from a guess.
 */
export async function lessonFacts(inference: Inference, course: Course, lessonId: string, signal?: AbortSignal): Promise<Command[]> {
  const lesson = course.lessons[lessonId];
  if (!lesson) throw new InferenceError('invalid', 'No such lesson.');
  const write = (told = '') => runJob(inference, { task: 'folio_facts', system: systemPrompt(course.language, course.locale), context: courseBackground(course), prompt: `${factsPrompt(course, lesson)}${told}`, effort: 'medium', schema: FactsDraft, signal }).then((r) => r.value);
  let value = await write();
  let found = await unsupportedIn(inference, course, lesson, value, signal);
  if (found.some((x) => x.length)) {
    const named = found.flatMap((x, i) => (x.length ? [`in "${value.cases[i]!.title}": ${x.map((y) => `"${y}"`).join('; ')}`] : []));
    value = await write(`\n\nA first answer was not usable. Its answers stated as fact what their cases do not give: ${named.join('. ')}. Either put what the answer needs under what is given, as part of the case, or take the claim out of the answer: an answer says only what follows from what is given.`);
    found = await unsupportedIn(inference, course, lesson, value, signal);
  }
  return [cmd('lesson.facts', { lessonId, keyIdeas: value.keyIdeas, vocabulary: value.vocabulary.map((t) => ({ ...t, id: newId('x') })), cases: value.cases.map((c, i) => ({ ...c, id: newId('x'), unsupported: found[i] ?? [] })) })];
}

/** The lesson's facts as every writer is given them, in place of a plan. */
export function factsSummary(lesson: Lesson): string {
  if (!lesson.cases.length) return '';
  const cases = lesson.cases.map((c, i) => `Case ${i + 1}, ${c.title}\n  Given: ${c.known}\n  Asked: ${c.question}\n  Answer: ${c.answer}${c.notShown.trim() ? `\n  Not shown by the case, and never claimed: ${c.notShown.trim()}` : ''}${c.unsupported.length ? `\n  In the answer above and NOT given by the case, so never stated as fact in what you write: ${c.unsupported.map((x) => `"${x}"`).join('; ')}` : ''}`);
  const terms = lesson.vocabulary.map((t) => `${t.term}: ${t.definition}`);
  return [
    'There is no lesson plan. What this lesson teaches was settled once, for every material written for it:',
    lesson.keyIdeas.map((k) => `- ${k}`).join('\n'),
    terms.length ? `Terms: ${terms.join('; ')}` : '',
    cases.join('\n\n'),
    'Where your material uses a case, an example or numbers, they are these, as given, with these answers and no cause, motive or figure the case does not give. A further example of your own agrees with them. Nothing here is a thing students or the teacher hold: it is not named or referred to.',
  ].filter(Boolean).join('\n\n');
}
