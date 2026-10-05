import { cmd, newId, type Command, type Course, type Flag, type Handout, type Lesson, type Segment, type Task } from '@folio/core';
import type { Runner } from '@folio/run';
import { z } from 'zod';
import { checkAnswers } from './answerCheck';
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
      'Write the sheets this lesson puts in students\' hands or on the wall, each in full and ready to print: every worksheet, exit ticket, organizer, set of cards, text to read or reference sheet that the plan names or plainly needs for what it has students do. None when the lesson needs none; six at most, and never two sheets for one activity.',
      'A sheet the plan describes is that sheet: its numbers, names, examples and questions are the plan\'s own, and where the plan gives only some of them ("ten problems like these") write them all. Give it as blocks in the order a student reads them: a line of instructions, then the questions as a list, a table to fill in with its headings and empty cells, a text as paragraphs, cards as a table with one card to a row, and "yours" wherever a student writes or draws. A question that is worked out leaves room to work.',
      'What a student should not see is not on the sheet: answers, hints at the answer, what the teacher is looking for. Those go under "key", every answer in the order of the questions, worked out by you from the sheet as written.',
      'Leave out what is not paper or is not yours to write: real objects and anything students bring, the slides, the quiz and the graded work (written separately), a text the teacher\'s sources hold (name it and where to find it in "copies"), and a sheet that would only repeat what the teacher says aloud.',
    ].join(' '),
  ].join('\n\n');
}

function toHandout(d: HandoutsDraft['handouts'][number]): Handout {
  return { id: newId('x'), title: d.title, kind: d.kind, usedIn: d.usedIn, copies: d.copies, blocks: exhibitPart({ label: '', blocks: d.blocks }).blocks, key: d.key };
}

/** A sheet with its key, as the answer check takes an assignment: the questions are its steps. */
function asTask(lesson: Lesson, h: Handout): Task {
  const steps = h.blocks.flatMap((b) => (b.type === 'list' ? b.items : b.type === 'table' ? [[b.columns.join(' | '), ...b.rows.map((r) => r.join(' | '))].join('\n')] : b.type === 'yours' ? [] : [b.type === 'field' ? `${b.label}: ${b.value}` : b.text]));
  return { id: h.id, lessonId: lesson.id, objectiveIds: [], sourceRefs: [], origin: 'ai', edited: false, flags: [], kind: 'assignment', title: h.title, prompt: '', steps, rubricId: null, answerKey: h.key, toward: '' };
}

/**
 * The plan's commands with its sheets written and, where there is a runner, their keys computed. A lesson
 * online has a page instead; and sheets that cannot be had never cost the plan.
 */
export async function withHandouts(inference: Inference, course: Course, lesson: Lesson, written: { commands: Command[]; flagged: number }, runner?: Runner, signal?: AbortSignal): Promise<{ commands: Command[]; flagged: number }> {
  const fill = written.commands.find((c) => c.type === 'section.fill' && c.payload.kind === 'plan');
  if (!fill || fill.type !== 'section.fill' || fill.payload.kind !== 'plan' || !fill.payload.content.segments.length) return written;
  const content = fill.payload.content;
  try {
    const result = await runJob(inference, { task: 'folio_handouts', system: systemPrompt(course.language, course.locale), context: courseBackground(course), prompt: handoutsPrompt(course, lesson, fill.payload.content), effort: 'medium', schema: HandoutsDraft, repair: false, signal });
    const handouts = result.value.handouts.map(toHandout);
    const found = runner ? (await checkAnswers(inference, runner, handouts.map((h) => asTask(lesson, h)), signal)).flags : new Map<string, Flag[]>();
    const notes: Flag[] = handouts.flatMap((h) => (found.get(h.id) ?? []).map((f): Flag => ({ code: 'reviewNote', values: { where: `Handout, ${h.title}`, text: f.code === 'answerCheck' ? `Worked out by running it, the key does not hold: ${f.values.claim} (${f.values.found}).` : '' } })));
    const commands = written.commands.map((c) => (c === fill ? cmd('section.fill', { lessonId: lesson.id, kind: 'plan', flags: [...fill.payload.flags, ...notes], content: { ...content, handouts } }) : c));
    return { commands, flagged: written.flagged + notes.length };
  } catch (error) {
    if (signal?.aborted) throw error;
    return written;
  }
}
