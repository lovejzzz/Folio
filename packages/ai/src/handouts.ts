import { cmd, newId, type Command, type Course, type Handout, type Lesson, type Segment } from '@folio/core';
import { z } from 'zod';
import { ExhibitBlockDraft, exhibitPart } from './exhibit';
import type { Inference } from './inference';
import { runJob } from './jobs';
import { courseBackground, lessonContext, systemPrompt } from './prompts';

/**
 * The sheets a lesson in a room hands out. A plan says "students sort the cards" or "hand out the exit ticket",
 * and until now that was all there was of the cards and the ticket: of what the lessons of six courses needed
 * made, nearly half was left to the teacher. Once a plan is settled, everything it puts in students' hands on
 * paper is written in full, from the plan's own numbers and examples, with the answers apart for the teacher.
 */

const line = z.string().min(1);

export const HandoutsDraft = z.object({
  handouts: z
    .array(
      z.object({
        title: line.describe('What the sheet is called, as the plan calls it'),
        kind: z.enum(['worksheet', 'organizer', 'reading', 'cards', 'slips', 'reference']).describe('"worksheet": questions with room to answer. "organizer": a table or frame to fill in. "reading": a text to read. "cards": a set to cut out, one card to a table row. "slips": a short ticket, several to a page. "reference": something to keep and look at'),
        usedIn: line.describe('The title of the plan\'s segment that uses it'),
        copies: line.describe('"One per student", "One set per group", "One to project"'),
        blocks: z.array(ExhibitBlockDraft).min(1).describe('The sheet itself, in full and in order, as a student gets it'),
        key: z.string().default('').describe('For the teacher only: the answer to every question on the sheet, in order, and what to look for; empty for a sheet with nothing to mark'),
      }),
    )
    .max(6)
    .default([]),
});
export type HandoutsDraft = z.infer<typeof HandoutsDraft>;

type Content = { keyIdeas: string[]; segments: Segment[] };

const planText = (plan: Content): string => plan.segments.map((s, i) => `${i + 1}. ${s.title} (${s.kind}, ${s.minutes} min): ${s.description}${s.teacherNotes ? `\n   Teacher's notes: ${s.teacherNotes}` : ''}`).join('\n');

export function handoutsPrompt(course: Course, lesson: Lesson, plan: Content): string {
  return [
    lessonContext(course, lesson),
    `The lesson plan, as it will be taught:\n${planText(plan)}`,
    [
      'Write the sheets this lesson puts in students\' hands or on the wall, each in full and ready to print: every worksheet, exit ticket (graded or not), organizer, set of cards, text to read, reference sheet, or paper the teacher is to mark or cut beforehand, that the plan names or plainly needs for what it has students do. None when the lesson needs none; six at most, one sheet for one activity, and none for a discussion held aloud.',
      'A sheet the plan describes is that sheet: its numbers, names, examples and questions are the plan\'s own, and where the plan gives only some of them ("ten problems like these") write them all; it asks nothing of a student that the plan has them do elsewhere (at desks, not at the floor line). Give it as blocks in the order a student reads them: a line of instructions; the questions as a list, unnumbered, since the page numbers them; a table to fill in, with its headings and empty cells; a text as paragraphs; cards as a table with one card to a row; and after each question a "yours" for the answer, with as many lines as the answer needs. A question is never written inside the room for its answer.',
      'What a student should not see is not on the sheet: answers, hints at the answer, what the teacher is looking for. Those go under "key", every answer in the order of the questions, worked out by you from the sheet as written; where a number in the plan disagrees with what you work out, the key gives what is right and says so.',
      'Quotation marks, and the words "excerpt" or "quotation", are only for the exact words of a real text you are sure of; a summary in your own words is called a summary.',
      'Leave out what is not paper or is not yours to write: real objects and anything students bring, the slides, the quiz and the graded work (written separately), a text the teacher\'s sources hold (name it and where to find it in "copies"), and a sheet that would only repeat what the teacher says aloud.',
    ].join(' '),
  ].join('\n\n');
}

function toHandout(d: HandoutsDraft['handouts'][number]): Handout {
  return { id: newId('x'), title: d.title, kind: d.kind, usedIn: d.usedIn, copies: d.copies, blocks: exhibitPart({ label: '', blocks: d.blocks }).blocks, key: d.key, supports: false };
}

/**
 * The plan's commands with its sheets written. A lesson online has a page instead; and sheets that cannot be had
 * never cost the plan. Their keys are not put through the answer check: on the first forty sheets it raised
 * eleven notes and every one was a false alarm (fractions, powers of ten, a constant with one more digit), while
 * a reviewer who worked all 94 answers by hand found none wrong.
 */
export async function withHandouts(inference: Inference, course: Course, lesson: Lesson, written: { commands: Command[]; flagged: number }, signal?: AbortSignal): Promise<{ commands: Command[]; flagged: number }> {
  const fill = written.commands.find((c) => c.type === 'section.fill' && c.payload.kind === 'plan');
  if (!fill || fill.type !== 'section.fill' || fill.payload.kind !== 'plan' || !fill.payload.content.segments.length) return written;
  const content = fill.payload.content;
  try {
    const result = await runJob(inference, { task: 'folio_handouts', system: systemPrompt(course.language, course.locale), context: courseBackground(course), prompt: handoutsPrompt(course, lesson, fill.payload.content), effort: 'medium', schema: HandoutsDraft, repair: false, signal });
    const handouts = result.value.handouts.map(toHandout);
    const commands = written.commands.map((c) => (c === fill ? cmd('section.fill', { lessonId: lesson.id, kind: 'plan', flags: fill.payload.flags, content: { ...content, handouts } }) : c));
    return { commands, flagged: written.flagged };
  } catch (error) {
    if (signal?.aborted) throw error;
    return written;
  }
}
