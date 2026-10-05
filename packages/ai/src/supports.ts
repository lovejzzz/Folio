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
      'Write the same sheet again for students who need support with the language: students still learning English, and students who read below the level of this page. They do the same task, with the same questions, numbers and content, and reach the same answers: nothing is taken out, made easier or answered for them.',
      'What changes is the way in. Instructions are in short sentences, one action each. Before the first question, a word bank gives the words of the subject that the sheet uses, each with a plain meaning of a few words (a table of two columns). A longer text is broken into short parts, each followed by one question on that part before the sheet\'s own questions. The first question of a kind is worked as an example where that does not give away another answer. Where an answer is to be written in sentences, a sentence starter is given ("The ratio is … because …") above the room to write; where it is a number, there is room to show the work.',
      'Keep every block of the original that still serves, in its order, and the same room to answer or more. Write no translation and no note to the student about why the sheet is different.',
    ].join(' '),
  ].join('\n\n');
}

/** The commands that put a supported copy of a sheet straight after it. The original is never changed. */
export async function supportedHandout(inference: Inference, course: Course, lessonId: string, handoutId: string, label: string, signal?: AbortSignal): Promise<Command[]> {
  const lesson = course.lessons[lessonId];
  const handout = lesson?.handouts.find((h) => h.id === handoutId);
  if (!lesson || !handout) throw new Error('No such handout');
  const result = await runJob(inference, { task: 'folio_handout_supports', system: systemPrompt(course.language, course.locale), context: courseBackground(course), prompt: supportedPrompt(course, lesson, handout), effort: 'medium', schema: SupportedDraft, repair: false, signal });
  const copy: Handout = { ...handout, id: newId('x'), title: `${handout.title} (${label})`, blocks: exhibitPart({ label: '', blocks: result.value.blocks }).blocks, key: [handout.key, result.value.keyNote].filter((t) => t.trim()).join('\n\n') };
  const at = lesson.handouts.indexOf(handout);
  return [cmd('plan.update', { lessonId, handouts: lesson.handouts.toSpliced(at + 1, 0, copy) })];
}
