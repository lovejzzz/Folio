import { cmd, newId, type Command, type Course, type Handout, type Lesson } from '@folio/core';
import { z } from 'zod';
import { ExhibitBlockDraft, exhibitPart } from './exhibit';
import type { Inference } from './inference';
import { runJob } from './jobs';
import { courseBackground, lessonContext, systemPrompt } from './prompts';

/**
 * A second copy of a sheet for students who need a way in: multilingual learners, students reading below the
 * level of the page. Six teachers in ten say they lack materials for them, and making a second version of every
 * sheet by hand is the work they most want help with. It is made when the teacher asks, sheet by sheet, and it
 * keeps the task: tools that only make the text easier hold those students below their grade all year.
 */

export const SupportedDraft = z.object({
  blocks: z.array(ExhibitBlockDraft).min(1).describe('The sheet with its supports, in full and in order'),
  keyNote: z.string().default('').describe('For the teacher: what was added, in one or two sentences, and anything in the key that the supports change; empty when nothing changes'),
});

const sheetText = (h: Handout): string => JSON.stringify({ title: h.title, kind: h.kind, blocks: h.blocks });

export function supportedPrompt(course: Course, lesson: Lesson, handout: Handout): string {
  return [
    lessonContext(course, lesson),
    `A sheet this lesson hands out:\n${sheetText(handout)}`,
    `Its answers, for the teacher:\n${handout.key || '(none)'}`,
    [
      'Write the same sheet again for students who need support with the language: students still learning English, and students who read below the level of this page. They do the same task, with the same questions, numbers and content, and reach the same answers: nothing is taken out, made easier or answered for them, and no question is added.',
      'What changes is the way in. Every instruction of the original is there, in short sentences of one action each. Before the first question, a word bank (a table of two columns) gives the words printed on the sheet that a newcomer may not know, subject words and everyday ones (units, foods, objects), each with a meaning of a few plain words that is exactly true as the subject uses the word and gives the answers on the sheet when followed (to round is to write the nearest value, not to cut digits off), never another subject word or a loose synonym. One worked example for the sheet, or one for each kind of question when there are two kinds, on numbers and things that are in no question, shows how to set an answer out. Where an answer is written in sentences, a starter gives the sentence\'s shape with a gap where the thinking goes ("… is greater than … because …"); where it is a number, there is room to show the work. Only a passage to read of more than about eighty words is broken into parts, with one question on each part; instructions and word problems are not.',
      'Nothing on the sheet does the thinking a question asks for. Read the key: no hint, starter, example or word-bank line names the operation to use, the order to write things in, which number is the whole, or the mistake to be found, and none uses a question\'s own numbers. The copy holds at most about twice the words of the original.',
      'Keep every block of the original that still serves, in its order, with the same room to answer or more. Write no translation, and nothing to the student about why the sheet is different. Under "keyNote", for the teacher, say in a sentence or two what was added.',
    ].join(' '),
  ].join('\n\n');
}

/** The commands that put a supported copy of a sheet straight after it. The original is never changed. */
export async function supportedHandout(inference: Inference, course: Course, lessonId: string, handoutId: string, signal?: AbortSignal): Promise<Command[]> {
  const lesson = course.lessons[lessonId];
  const handout = lesson?.handouts.find((h) => h.id === handoutId);
  if (!lesson || !handout) throw new Error('No such handout');
  const result = await runJob(inference, { task: 'folio_handout_supports', system: systemPrompt(course.language, course.locale), context: courseBackground(course), prompt: supportedPrompt(course, lesson, handout), effort: 'medium', schema: SupportedDraft, repair: false, signal });
  // The copy keeps its sheet's own title: what marks it is for the teacher, and never printed on a student's page.
  const copy: Handout = { ...handout, id: newId('x'), supports: true, blocks: exhibitPart({ label: '', blocks: result.value.blocks }).blocks, key: [handout.key, result.value.keyNote].filter((t) => t.trim()).join('\n\n') };
  const at = lesson.handouts.indexOf(handout);
  return [cmd('plan.update', { lessonId, handouts: lesson.handouts.toSpliced(at + 1, 0, copy) })];
}
